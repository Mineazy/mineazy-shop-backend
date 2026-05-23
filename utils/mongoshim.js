const Datastore = require('nedb-promises');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');

function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

function parseQuery(query) {
  if (!query || typeof query !== 'object') return query || {};
  const { _id, ...rest } = query;
  const parsed = {};
  if (_id) {
    if (Array.isArray(_id.$in)) {
      parsed._id = { $in: _id.$in };
    } else if (typeof _id.$ne !== 'undefined') {
      parsed._id = { $ne: _id.$ne };
    } else if (typeof _id.$regex !== 'undefined') {
      parsed._id = { $regex: new RegExp(_id.$regex.replace(/^\/(.*)\/$/, '$1'), _id.$options || '') };
    } else {
      parsed._id = typeof _id === 'string' && _id.length === 24 ? _id : _id.toString();
    }
  }
  for (const [key, val] of Object.entries(rest)) {
    if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof RegExp)) {
      const ops = {};
      for (const [op, opVal] of Object.entries(val)) {
        if (op === '$regex') {
          ops[op] = opVal;
          if (val.$options) ops.$options = val.$options;
        } else if (op === '$in' || op === '$ne' || op === '$gt' || op === '$gte' || op === '$lt' || op === '$lte' || op === '$exists' || op === '$nin') {
          ops[op] = opVal;
        } else if (op === '$or' || op === '$and') {
          ops[op] = opVal.map(sub => parseQuery(sub));
        }
      }
      parsed[key] = Object.keys(ops).length ? ops : val;
    } else if (val && typeof val === 'object' && val.constructor && val.constructor.name === 'ObjectId') {
      parsed[key] = val.toString();
    } else {
      parsed[key] = val;
    }
  }
  if (query.$or) parsed.$or = query.$or.map(sub => parseQuery(sub));
  if (query.$and) parsed.$and = query.$and.map(sub => parseQuery(sub));
  if (query.$text) parsed.$text = query.$text;
  return parsed;
}

class QueryBuilder {
  constructor(model, query) {
    this._model = model;
    this._query = query;
    this._sort = null;
    this._skipVal = 0;
    this._limitVal = 0;
    this._populateFields = [];
  }

  sort(sortObj) { this._sort = sortObj; return this; }
  skip(n) { this._skipVal = n; return this; }
  limit(n) { this._limitVal = n; return this; }
  select() { return this; }
  lean() { return this; }
  populate(field, select) { this._populateFields.push({ field, select }); return this; }

  then(resolve, reject) {
    return this._exec().then(resolve, reject);
  }

  catch(reject) {
    return this._exec().then(undefined, reject);
  }

  async _exec() {
    const parsed = parseQuery(this._query);
    let results = await this._model.db.find(parsed);

    if (this._sort) {
      results = Array.from(results);
      results.sort((a, b) => {
        for (const [key, dir] of Object.entries(this._sort)) {
          const va = a[key], vb = b[key];
          if (va == null) return 1; if (vb == null) return -1;
          return dir > 0 ? (va > vb ? 1 : va < vb ? -1 : 0) : (va < vb ? 1 : va > vb ? -1 : 0);
        }
      });
    }

    if (this._skipVal) results = results.slice(this._skipVal);
    if (this._limitVal) results = results.slice(0, this._limitVal);

    return results;
  }
}

class MongoShim {
  constructor(name, schema = {}) {
    this.name = name;
    this.schema = schema;
    this.db = Datastore.create({
      filename: path.join(DATA_DIR, `${name}.db`),
      autoload: true,
    });
    if (schema.indexes) {
      this.db.ensureIndex(schema.indexes);
    }
  }

  async _applyDefaults(doc, isNew = true) {
    if (!doc._id) doc._id = generateId();
    if (this.schema.timestamps) {
      const now = new Date().toISOString();
      if (isNew) doc.createdAt = now;
      doc.updatedAt = now;
    }
    if (this.schema.fields) {
      for (const [field, def] of Object.entries(this.schema.fields)) {
        if (doc[field] === undefined && def.default !== undefined) {
          doc[field] = typeof def.default === 'function' ? def.default() : def.default;
        }
      }
    }
    return doc;
  }

  async _runPreSave(doc, isNew) {
    if (this.schema.preSave) {
      await this.schema.preSave(doc, isNew);
    }
  }

  async insert(doc) {
    const data = Array.isArray(doc) ? doc : [doc];
    const inserted = [];
    for (const d of data) {
      await this._applyDefaults(d, true);
      await this._runPreSave(d, true);
      const result = await this.db.insert(d);
      inserted.push(result);
    }
    return Array.isArray(doc) ? inserted : inserted[0];
  }

  find(query = {}) {
    return new QueryBuilder(this, query);
  }

  async findOne(query = {}) {
    const parsed = parseQuery(query);
    return this.db.findOne(parsed);
  }

  async findById(id) {
    if (id && typeof id === 'object' && id._id) id = id._id;
    return this.db.findOne({ _id: typeof id === 'object' ? id.toString() : id });
  }

  async countDocuments(query = {}) {
    return this.db.count(parseQuery(query));
  }

  async update(query, updateData, options = {}) {
    const parsed = parseQuery(query);
    if (updateData.$set) {
      updateData = { ...updateData.$set, updatedAt: new Date().toISOString() };
    } else if (updateData.$push) {
      const existing = await this.findOne(parsed);
      if (existing) {
        for (const [key, val] of Object.entries(updateData.$push)) {
          existing[key] = existing[key] || [];
          existing[key].push(val);
        }
        existing.updatedAt = new Date().toISOString();
        await this.db.update(parsed, existing, {});
        return options.multi ? [1] : 1;
      }
      return 0;
    } else if (updateData.$pull) {
      const existing = await this.findOne(parsed);
      if (existing) {
        for (const [key, val] of Object.entries(updateData.$pull)) {
          if (existing[key]) {
            existing[key] = existing[key].filter(item => {
              if (typeof item === 'object') return (item._id || item.product || item) !== (val._id || val.product || val);
              return item !== val;
            });
          }
        }
        existing.updatedAt = new Date().toISOString();
        await this.db.update(parsed, existing, {});
        return options.multi ? [1] : 1;
      }
      return 0;
    } else if (updateData.$inc) {
      const existing = await this.findOne(parsed);
      if (existing) {
        for (const [key, val] of Object.entries(updateData.$inc)) {
          existing[key] = (existing[key] || 0) + val;
        }
        existing.updatedAt = new Date().toISOString();
        await this.db.update(parsed, existing, {});
        return options.multi ? [1] : 1;
      }
      return 0;
    } else {
      updateData.updatedAt = new Date().toISOString();
    }
    const numUpdated = await this.db.update(parsed, updateData, { multi: options.multi || false });
    return numUpdated;
  }

  async remove(query = {}) {
    const parsed = parseQuery(query);
    return this.db.remove(parsed, { multi: true });
  }

  async findByIdAndDelete(id) {
    const doc = await this.findById(id);
    if (doc) await this.db.remove({ _id: doc._id }, {});
    return doc;
  }

  async findOneAndDelete(query) {
    const doc = await this.findOne(query);
    if (doc) await this.db.remove({ _id: doc._id }, {});
    return doc;
  }

  async aggregate(pipeline) {
    let docs = await this.db.find({});
    for (const stage of pipeline) {
      if (stage.$match) {
        docs = docs.filter(d => this._matchFilter(d, parseQuery(stage.$match)));
      } else if (stage.$group) {
        const groups = {};
        for (const d of docs) {
          let key;
          if (typeof stage.$group._id === 'string' && stage.$group._id.startsWith('$')) {
            key = d[stage.$group._id.slice(1)] || null;
          } else if (typeof stage.$group._id === 'object') {
            key = JSON.stringify(stage.$group._id);
          } else {
            key = null;
          }
          const strKey = String(key);
          if (!groups[strKey]) {
            groups[strKey] = { _id: key };
            for (const [k, v] of Object.entries(stage.$group)) {
              if (k === '_id') continue;
              if (v.$sum !== undefined) groups[strKey][k] = 0;
              if (v.$push !== undefined) groups[strKey][k] = [];
              if (v.$first !== undefined) groups[strKey][k] = null;
              if (v.$addToSet !== undefined) groups[strKey][k] = new Set();
            }
          }
          for (const [k, v] of Object.entries(stage.$group)) {
            if (k === '_id') continue;
            if (v.$sum !== undefined) {
              const val = typeof v.$sum === 'string' && v.$sum.startsWith('$') ? (d[v.$sum.slice(1)] || 0) : v.$sum;
              groups[strKey][k] += val;
            }
            if (v.$push !== undefined) {
              const val = typeof v.$push === 'string' && v.$push.startsWith('$') ? d[v.$push.slice(1)] : v.$push;
              groups[strKey][k].push(val);
            }
            if (v.$addToSet !== undefined) {
              const val = typeof v.$addToSet === 'string' && v.$addToSet.startsWith('$') ? d[v.$addToSet.slice(1)] : v.$addToSet;
              groups[strKey][k].add(val);
            }
            if (v.$first !== undefined) {
              if (groups[strKey][k] === null) {
                groups[strKey][k] = typeof v.$first === 'string' && v.$first.startsWith('$') ? d[v.$first.slice(1)] : v.$first;
              }
            }
          }
        }
        docs = Object.values(groups).map(g => {
          if (g.items && g.items instanceof Set) g.items = Array.from(g.items);
          if (g.tags && g.tags instanceof Set) g.tags = Array.from(g.tags);
          return g;
        });
      } else if (stage.$sort) {
        docs.sort((a, b) => {
          for (const [key, dir] of Object.entries(stage.$sort)) {
            const va = a[key], vb = b[key];
            if (va == null) return 1; if (vb == null) return -1;
            const cmp = va > vb ? 1 : va < vb ? -1 : 0;
            if (cmp !== 0) return dir > 0 ? cmp : -cmp;
          }
          return 0;
        });
      } else if (stage.$limit) {
        docs = docs.slice(0, stage.$limit);
      } else if (stage.$skip) {
        docs = docs.slice(stage.$skip);
      } else if (stage.$unwind) {
        const field = stage.$unwind.startsWith('$') ? stage.$unwind.slice(1) : stage.$unwind;
        docs = docs.flatMap(d => {
          const arr = d[field] || [];
          if (arr.length === 0) return [{ ...d, [field]: undefined }];
          return arr.map(item => ({ ...d, [field]: item }));
        });
      } else if (stage.$lookup) {
        const refModel = this._models ? this._models[stage.$lookup.from] : null;
        if (refModel) {
          const allRefDocs = await refModel.find({});
          for (const d of docs) {
            const localVal = d[stage.$lookup.localField];
            const as = stage.$lookup.as;
            if (localVal === undefined || localVal === null) {
              d[as] = [];
            } else if (Array.isArray(localVal)) {
              d[as] = allRefDocs.filter(r => localVal.includes(r[stage.$lookup.foreignField]));
            } else {
              d[as] = allRefDocs.filter(r => r[stage.$lookup.foreignField] === localVal);
            }
          }
        }
      }
    }
    return docs;
  }

  _matchFilter(doc, query) {
    for (const [key, val] of Object.entries(query)) {
      if (key === '$or') {
        if (!val.some(sub => this._matchFilter(doc, sub))) return false;
        continue;
      }
      if (key === '$and') {
        if (!val.every(sub => this._matchFilter(doc, sub))) return false;
        continue;
      }
      if (key === '$text') continue;
      const docVal = doc[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        for (const [op, opVal] of Object.entries(val)) {
          if (op === '$in') { if (!opVal.includes(docVal)) return false; }
          else if (op === '$nin') { if (opVal.includes(docVal)) return false; }
          else if (op === '$ne') { if (docVal == opVal) return false; }
          else if (op === '$gt') { if (!(docVal > opVal)) return false; }
          else if (op === '$gte') { if (!(docVal >= opVal)) return false; }
          else if (op === '$lt') { if (!(docVal < opVal)) return false; }
          else if (op === '$lte') { if (!(docVal <= opVal)) return false; }
          else if (op === '$exists') { if (opVal ? docVal === undefined : docVal !== undefined) return false; }
          else if (op === '$regex') {
            const flags = val.$options || '';
            if (typeof docVal !== 'string' || !new RegExp(opVal, flags).test(docVal)) return false;
          }
        }
      } else {
        if (docVal !== val) return false;
      }
    }
    return true;
  }

  static async populate(docs, field, refModel, selectFields) {
    if (!docs) return docs;
    const single = !Array.isArray(docs);
    const arr = single ? [docs] : docs;
    if (!arr.length) return docs;
    const refIds = [...new Set(arr.map(d => {
      const val = d[field];
      if (Array.isArray(val)) return val;
      return val;
    }).flat().filter(Boolean))];
    if (!refIds.length) return docs;
    const refDocs = await refModel.find({ _id: { $in: refIds } });
    const refMap = {};
    for (const r of refDocs) refMap[r._id] = r;
    for (const d of arr) {
      const val = d[field];
      if (Array.isArray(val)) {
        d[field] = val.map(id => refMap[id] || id).filter(Boolean);
      } else if (val) {
        d[field] = refMap[val] || val;
      }
    }
    return single ? arr[0] : arr;
  }
}

module.exports = MongoShim;
