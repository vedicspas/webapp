"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { toast } from "@/stores/toastStore";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

function InnerForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function pay() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    const result = await stripe.confirmPayment({ elements, redirect: "if_required" });
    if (result.error) {
      toast(result.error.message ?? "Payment failed", "error");
      setSubmitting(false);
    } else {
      onSuccess();
    }
  }

  return (
    <div>
      <PaymentElement />
      <button
        onClick={pay}
        disabled={submitting || !stripe}
        className="mt-4 w-full rounded-full bg-turmeric-400 py-2.5 font-semibold text-veda-900 hover:bg-turmeric-300 disabled:opacity-50"
      >
        {submitting ? "Processing\u2026" : "Pay now"}
      </button>
    </div>
  );
}

export function PaymentForm({
  clientSecret,
  onSuccess,
}: {
  clientSecret: string;
  onSuccess: () => void;
}) {
  if (!stripePromise) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Stripe publishable key is not configured. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
      </p>
    );
  }
  return (
    <Elements
      stripe={stripePromise}
      options={{ clientSecret, appearance: { variables: { colorPrimary: "#35674a" } } }}
    >
      <InnerForm onSuccess={onSuccess} />
    </Elements>
  );
}
