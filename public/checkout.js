// This is your public test API key.
const stripe = Stripe("pk_test_51QP5vhDiRHn1y6KSTBWC1fAsVHDA0uNdOd9bBhrhAZO4tPRlME6MyvLz6ZSoCcUFqDCeb4OX8QkKYopDQfDRWBEh00nSBKsbYK", {
  betas: ['embedded_checkout_byol_beta_1']
});

initialize();

async function initialize() {
  // Fetch Checkout Session and retrieve the client secret
  const fetchClientSecret = async () => {
    const response = await fetch("/create-checkout-session", {
      method: "POST",
    });
    const { clientSecret } = await response.json();
    return clientSecret;
  };

  // Call your backend to set shipping options
  const onShippingDetailsChange = async (shippingDetailsChangeEvent) => {
    const {checkoutSessionId, shippingDetails} = shippingDetailsChangeEvent;
    const response = await fetch("/calculate-shipping-options", {
      method: "POST",
      body: JSON.stringify({
        checkout_session_id: checkoutSessionId,
        shipping_details: shippingDetails,
      })
    })

    if (response.type === 'error') {
      return Promise.resolve({type: "reject", errorMessage: response.message});
    } else {
      return Promise.resolve({type: "accept"});
    }
  };

  // Initialize Checkout
  const checkout = await stripe.initEmbeddedCheckout({
    fetchClientSecret,
    onShippingDetailsChange,
  });

  // Mount Checkout
  checkout.mount('#checkout');
}