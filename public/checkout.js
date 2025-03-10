// This is your public test API key.
const stripe = Stripe("pk_live_51QP5vhDiRHn1y6KS3GBaWIQqIQ0jgaddsz3Qo2PDBuiSmBFoDbJVqyj2y5LnzSk1vMaTBCa6NnB5fEZEazdegfz2007uJcUD4O", {
  betas: ['embedded_checkout_byol_beta_1']
});

// Add your Heroku server base URL
const SERVER_BASE_URL = "https://tbaa-ehv-4792f0431457.herokuapp.com";

// Define a variable to track if checkout is being initialized
let isInitializing = false;

document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM loaded, waiting to initialize...");
  // Only initialize if not already in progress
  if (!isInitializing) {
    initialize();
  }
});

// Create a Checkout Session with dynamic shipping
async function initialize() {
  // Prevent multiple initializations
  if (isInitializing) {
    console.log("Initialization already in progress, skipping...");
    return;
  }
  
  isInitializing = true;
  console.log("Starting checkout initialization...");
  
  try {
    // Make sure the elements exist before trying to access them
    const loadingEl = document.getElementById('loading');
    const checkoutEl = document.getElementById('checkout');
    
    if (!loadingEl || !checkoutEl) {
      throw new Error("Required DOM elements not found. Make sure 'loading' and 'checkout' elements exist.");
    }
    
    // Show loading and hide checkout
    loadingEl.style.display = 'flex';
    checkoutEl.style.display = 'none';
    
    // Fetch Checkout Session and retrieve the client secret
    const fetchClientSecret = async () => {
      try {
        console.log("Fetching client secret from:", `${SERVER_BASE_URL}/create-checkout-session`);
        
        const response = await fetch(`${SERVER_BASE_URL}/create-checkout-session`, {
          method: "POST",
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include' // Include cookies for cross-origin requests if needed
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Error response from server: ${errorText}`);
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Client secret received:", data.clientSecret ? "Yes" : "No");
        return data.clientSecret;
      } catch (error) {
        console.error("Error fetching client secret:", error);
        throw error;
      }
    };

    // Call your backend to set shipping options
    const onShippingDetailsChange = async (shippingDetailsChangeEvent) => {
      console.log("===== SHIPPING DETAILS CHANGE EVENT =====");
      console.log("Full Event Object:", JSON.stringify(shippingDetailsChangeEvent, null, 2));
      
      const { checkoutSessionId, shippingDetails } = shippingDetailsChangeEvent;

      if (!shippingDetails) {
        console.error("Error: shippingDetails is missing from event.");
        return { type: "reject", errorMessage: "Shipping details are missing." };
      }
      
      console.log("Checkout Session ID:", checkoutSessionId);
      console.log("Shipping Details:", JSON.stringify(shippingDetails, null, 2));
    
      // Comprehensive field validation
      const missingFields = [];
      if (!shippingDetails) {
        console.error("NO SHIPPING DETAILS PROVIDED");
        return { 
          type: "reject", 
          errorMessage: "Shipping details are missing. Please complete all required fields." 
        };
      }
    
      // Check for required fields
      if (!shippingDetails.name) missingFields.push("Name");
      if (!shippingDetails.address) missingFields.push("Address");
      if (!shippingDetails.address?.line1) missingFields.push("Address Line 1");
      if (!shippingDetails.address?.city) missingFields.push("City");
      if (!shippingDetails.address?.postal_code) missingFields.push("Postal Code");
      if (!shippingDetails.address?.country) missingFields.push("Country");
    
      if (missingFields.length > 0) {
        console.error("MISSING FIELDS:", missingFields);
        return { 
          type: "reject", 
          errorMessage: `Please complete the following shipping details: ${missingFields.join(", ")}` 
        };
      }
    
      console.log("About to send request to calculate shipping options");

      try {
        // Use absolute URL instead of relative path
        const response = await fetch(`${SERVER_BASE_URL}/calculate-shipping-options`, {
          method: "POST",
          body: JSON.stringify({
            checkout_session_id: checkoutSessionId,
            shipping_details: shippingDetails,
          }),
          headers: { "Content-Type": "application/json" },
          credentials: 'include' // Include cookies if needed
        });

        const responseData = await response.json();

        console.log("Received result from server:", JSON.stringify(responseData, null, 2));

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

    console.log("Initializing embedded checkout...");

    // Initialize Checkout with shipping calculation
    const checkout = await stripe.initEmbeddedCheckout({
      fetchClientSecret,
      onShippingDetailsChange,
    });
    
    console.log("Checkout initialized, mounting to DOM...");

    // Hide loading and show checkout container
    loadingEl.style.display = 'none';
    checkoutEl.style.display = 'block';
    
    // Mount Checkout
    checkout.mount('#stripe-checkout-container');
    console.log("Checkout mounted");
    
  } catch (error) {
    console.error("Initialization error:", error);
    const checkoutEl = document.querySelector('#checkout');
    if (checkoutEl) {
      checkoutEl.innerHTML = `
        <div class="error-message">
          <p>There was an error initializing the checkout: ${error.message}</p>
          <p>Please check the console for more details.</p>
        </div>
      `;
      checkoutEl.style.display = 'block';
    }
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
  } finally {
    isInitializing = false;
  }
}