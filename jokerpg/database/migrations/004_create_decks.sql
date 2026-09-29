-- =============================================================================
-- JOKER RPG — MIGRAÇÃO 004: Baralhos de Cartas (Decks) e Composição de Slots
-- =============================================================================

-- 1. Tabela Principal de Baralhos do Jogador
CREATE TABLE IF NOT EXISTS decks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_decks_user_id ON decks(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_decks_user_active ON decks(user_id, is_active) WHERE is_active = TRUE AND deleted_at IS NULL;

-- 2. Associação de Cartas nos Slots do Baralho (1 a 10 cartas)
CREATE TABLE IF NOT EXISTS deck_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    slot_index INTEGER NOT NULL CHECK (slot_index >= 1 AND slot_index <= 10),
    CONSTRAINT uq_deck_slot UNIQUE (deck_id, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_deck_cards_deck_id ON deck_cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_deck_cards_card_id ON deck_cards(card_id);