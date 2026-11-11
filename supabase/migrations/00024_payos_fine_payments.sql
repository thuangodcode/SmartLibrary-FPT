ALTER TABLE public.fines
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20),
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100),
    ADD COLUMN IF NOT EXISTS recorded_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.fine_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fine_id UUID NOT NULL REFERENCES public.fines(id) ON DELETE CASCADE,
    method VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
    initiated_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    recorded_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    order_code BIGINT,
    payment_link_id VARCHAR(100),
    checkout_url TEXT,
    qr_code TEXT,
    provider_reference VARCHAR(100),
    expires_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fine_payments_order_code
    ON public.fine_payments(order_code) WHERE order_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fine_payments_pending_payos_fine
    ON public.fine_payments(fine_id) WHERE status = 'pending' AND method = 'PayOS';
CREATE INDEX IF NOT EXISTS idx_fine_payments_status_paid_at
    ON public.fine_payments(status, paid_at);
