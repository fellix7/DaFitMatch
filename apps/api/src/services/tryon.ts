/**
 * Virtual try-on (Phase 5, owner: Member 3). Paid API (fal), on demand only, cached by
 * (input_hash, product_id), capped per user per day via the `consume_tryon_quota` RPC, kill switch
 * in app_settings. The HTTP route only enqueues; the pg-boss worker calls the provider.
 */
export {};
