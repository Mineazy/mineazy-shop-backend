const crypto = require('crypto');
const axios = require('axios');

class PaynowClient {
  constructor(integrationId, integrationKey, returnUrl, resultUrl) {
    this.integrationId = integrationId;
    this.integrationKey = integrationKey;
    this.returnUrl = returnUrl;
    this.resultUrl = resultUrl;
    this.apiUrl = 'https://www.paynow.co.zw/interface/initiatetransaction';
  }

  /**
   * Generate SHA512 hash according to Paynow specification
   */
  generateHash(values) {
    // Concatenate all values
    let dataString = '';
    for (const key in values) {
      if (key !== 'hash') {
        dataString += values[key];
      }
    }
    
    // Append integration key
    dataString += this.integrationKey;
    
    // Generate SHA512 hash and return uppercase
    return crypto
      .createHash('sha512')
      .update(dataString)
      .digest('hex')
      .toUpperCase();
  }

  /**
   * Verify hash from Paynow response
   */
  verifyHash(values, receivedHash) {
    const generatedHash = this.generateHash(values);
    return generatedHash === receivedHash;
  }

  /**
   * Initiate payment transaction
   */
  async initiateTransaction(reference, amount, email, phone, additionalInfo = '', authEmailOverride = '') {
    try {
      // Prepare payment data according to Paynow docs
      const authEmail = authEmailOverride || email;

      const paymentData = {
        id: this.integrationId,
        reference: reference,
        amount: amount.toFixed(2), // Must be decimal with 2 places
        additionalinfo: additionalInfo,
        returnurl: this.returnUrl,
        resulturl: this.resultUrl,
        authemail: authEmail,
        status: 'Message'
      };

      // Add phone if provided
      if (phone) {
        paymentData.authphone = phone;
      }

      // Generate hash
      paymentData.hash = this.generateHash(paymentData);

      console.log('≡ƒöÉ Initiating Paynow transaction:', {
        reference,
        amount: paymentData.amount,
        customerEmail: email,
        authEmail,
        integrationId: this.integrationId
      });
      
      // Log the data being sent (without sensitive info)
      console.log('≡ƒôñ Payment data being sent:', {
        ...paymentData,
        hash: paymentData.hash.substring(0, 20) + '...',
        id: this.integrationId
      });

      // Make POST request to Paynow (URL encoded form data)
      const response = await axios.post(
        this.apiUrl,
        new URLSearchParams(paymentData).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 30000 // 30 second timeout
        }
      );

      console.log('≡ƒôÑ Raw Paynow response:', response.data);

      // Parse response (comes as URL encoded string)
      const responseData = this.parseResponse(response.data);

      console.log('≡ƒôÑ Parsed Paynow response:', responseData);

      // Verify response hash
      if (responseData.hash) {
        const isValid = this.verifyHash(responseData, responseData.hash);
        if (!isValid) {
          console.error('Γ¥î Hash verification failed!');
          throw new Error('Invalid hash in Paynow response');
        }
        console.log('Γ£à Hash verified successfully');
      }

      // Check if transaction was successful
      if (responseData.status === 'Ok') {
        console.log('Γ£à Paynow transaction initiated successfully');
        return {
          success: true,
          browserUrl: responseData.browserurl,
          pollUrl: responseData.pollurl,
          reference: reference
        };
      } else if (responseData.status === 'Error') {
        const errorMessage = responseData.error || 'Unknown error from Paynow';
        console.error('Γ¥î Paynow returned error:', errorMessage);
        console.error('Full error response:', responseData);
        
        return {
          success: false,
          error: errorMessage,
          details: responseData
        };
      } else {
        console.error('Γ¥î Unexpected status from Paynow:', responseData.status);
        throw new Error('Unexpected response status from Paynow: ' + responseData.status);
      }

    } catch (error) {
      console.error('Γ¥î Paynow transaction error:', error.message);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        console.error('Response headers:', error.response.headers);
      }

      if (error.code === 'ECONNABORTED') {
        return {
          success: false,
          error: 'Request timeout - please try again'
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to initiate payment'
      };
    }
  }

  /**
   * Parse URL-encoded response from Paynow
   */
  parseResponse(data) {
    const params = new URLSearchParams(data);
    const result = {};
    
    for (const [key, value] of params.entries()) {
      result[key.toLowerCase()] = value;
    }
    
    return result;
  }

  /**
   * Poll transaction status
   */
  async pollTransaction(pollUrl) {
    try {
      console.log('≡ƒöì Polling transaction status:', pollUrl);
      
      const response = await axios.post(pollUrl, '', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });

      const result = this.parseResponse(response.data);
      console.log('≡ƒôè Poll result:', result);
      
      return result;
    } catch (error) {
      console.error('Γ¥î Poll transaction error:', error.message);
      throw error;
    }
  }
}

module.exports = PaynowClient;
