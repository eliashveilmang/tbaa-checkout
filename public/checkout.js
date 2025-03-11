// Add your Heroku server base URL
const SERVER_BASE_URL = "https://tbaa-ehv-4792f0431457.herokuapp.com";
// This is your public test API key.
// Replace your current Stripe initialization with this
const stripe = Stripe("pk_live_51QP5vhDiRHn1y6KS3GBaWIQqIQ0jgaddsz3Qo2PDBuiSmBFoDbJVqyj2y5LnzSk1vMaTBCa6NnB5fEZEazdegfz2007uJcUD4O", {
  betas: ['embedded_checkout_byol_beta_1']
});

document.addEventListener('DOMContentLoaded', function() {
  initialize();
});

// Create a Checkout Session with dynamic shipping
async function initialize() {
  try {
    console.log("Initializing embedded checkout...");
    
    document.getElementById('loading').style.display = 'flex';
    document.getElementById('checkout').style.display = 'none';

    // Fetch Checkout Session and retrieve the client secret
    const fetchClientSecret = async () => {
      try {
        console.log("Fetching client secret...");
        const timestamp = new Date().getTime(); // Add unique timestamp
        const response = await fetch(`/create-checkout-session?t=${timestamp}`, {
          method: "POST",
          headers: {
            'Content-Type': 'application/json'
          }
        });

        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Error response from server: ${errorText}`);
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Response Data:", data);
        return data.client_secret;
      } catch (error) {
        console.error("Error fetching client secret:", error);
        throw error;
      }
    };

    // Call your backend to set shipping options
    // Modified onShippingDetailsChange - simplified for clarity
    const onShippingDetailsChange = async (shippingDetailsChangeEvent) => {
      console.log("Shipping details changed");
      
      const { checkoutSessionId, shippingDetails } = shippingDetailsChangeEvent;

      if (!shippingDetails) {
        console.error("Error: shippingDetails is missing from event.");
        return { type: "reject", errorMessage: "Shipping details are missing." };
      }
      
      try {
        const response = await fetch("/calculate-shipping-options", {
          method: "POST",
          body: JSON.stringify({
            checkout_session_id: checkoutSessionId,
            shipping_details: shippingDetails,
          }),
          headers: { "Content-Type": "application/json" },
        });

        const responseData = await response.json();
        console.log("Shipping calculation result:", responseData);

        if (responseData.type === 'error') {
          return { type: "reject", errorMessage: responseData.message };
        } else {
          return { type: "accept" };
        }
      } catch (error) {
        console.error('Error processing shipping details:', error);
        return { 
          type: "reject", 
          errorMessage: `Shipping details error: ${error.message}` 
        };
      }
    };

    // Initialize Checkout with shipping calculation - keep it simple
    try {
      console.log("Creating checkout instance...");
      const checkout = await stripe.initEmbeddedCheckout({
        fetchClientSecret,
        onShippingDetailsChange
      });
      
      console.log("Checkout instance created, mounting...");
      
      // Hide loading and show checkout container
      document.getElementById('loading').style.display = 'none';
      document.getElementById('checkout').style.display = 'block';
      
      // Mount Checkout
      checkout.mount('#checkout');
      console.log("Checkout mounted successfully");
    } catch (checkoutError) {
      console.error("Error setting up checkout:", checkoutError);
      document.querySelector('#checkout').innerHTML = `
        <div class="error-message">
          <p>There was an error initializing the checkout: ${checkoutError.message}</p>
          <p>Please try opening <a href="https://tbaa-ehv-4792f0431457.herokuapp.com/checkout.html" target="_blank">the checkout page directly</a>.</p>
        </div>
      `;
    }
    
  } catch (error) {
    console.error("Initialization error:", error);
    document.querySelector('#checkout').innerHTML = `
      <div class="error-message">
        <p>There was an error initializing the checkout: ${error.message}</p>
        <p>Please try opening <a href="https://tbaa-ehv-4792f0431457.herokuapp.com/checkout.html" target="_blank">the checkout page directly</a>.</p>
      </div>
    `;
  }
}