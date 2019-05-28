const paypal = require('@paypal/checkout-server-sdk');
 
// Creating an environment
let clientId = process.env.PAYPAL_CLIENT;
let clientSecret = process.env.PAYPAL_KEY;
let environment = new paypal.core.SandboxEnvironment(clientId, clientSecret);
let client = new paypal.core.PayPalHttpClient(environment);

const RetrieveOrder = async (orderId) => {
    let response;
    try {
        const request = new paypal.orders.OrdersCaptureRequest(orderId);
        response = await client.execute(request);
    }
    catch(error){
        response = error;
    }
    return response;
}

module.exports = RetrieveOrder;