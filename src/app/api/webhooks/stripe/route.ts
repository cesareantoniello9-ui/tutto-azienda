import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

function getStripe() {
  // Lazy init: evita errore a module-load time se la chiave non è presente
  const { default: StripeSDK } = require("stripe") as { default: typeof import("stripe").default };
  return new StripeSDK(process.env.STRIPE_SECRET_KEY!);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      // TODO: sync plan status to tenant
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
