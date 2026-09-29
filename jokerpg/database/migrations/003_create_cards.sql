-- =============================================================================
-- JOKER RPG — MIGRAÇÃO 003: Catálogo Mestre de Cartas e Inventário de Jogadores
-- =============================================================================

-- 1. Catálogo Mestre de Cartas Colecionáveis e Táticas
CREATE TABLE IF NOT EXISTS cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('ATTACK', 'DEFENSE', 'TECHNIQUE', 'SPECIAL', 'ULTIMATE')),
    rarity VARCHAR(30) NOT NULL CHECK (rarity IN ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC')),
    element VARCHAR(30) NOT NULL CHECK (element IN ('FIRE', 'WATER', 'WIND', 'EARTH', 'LIGHTNING', 'LIGHT', 'DARK')),
    energy_cost INTEGER NOT NULL DEFAULT 1 CHECK (energy_cost >= 0 AND energy_cost <= 10),
    damage INTEGER NOT NULL DEFAULT 0 CHECK (damage >= 0),
    defense INTEGER NOT NULL DEFAULT 0 CHECK (defense >= 0),
    break_damage INTEGER NOT NULL DEFAULT 10 CHECK (break_damage >= 0),
    effect_code VARCHAR(50) DEFAULT 'NONE',
    cooldown INTEGER NOT NULL DEFAULT 0 CHECK (cooldown >= 0),
    requirement JSONB NOT NULL DEFAULT '{}'::jsonb,
    combo_modifier VARCHAR(50) DEFAULT 'STANDARD',
    image_data BYTEA,
    image_mime VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cards_rarity ON cards(rarity) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cards_element ON cards(element) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cards_energy_cost ON cards(energy_cost) WHERE deleted_at IS NULL;

-- 2. Inventário de Cartas do Jogador (Cartas Adquiridas e Quantidade)
CREATE TABLE IF NOT EXISTS user_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    acquired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_card UNIQUE (user_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_user_cards_user_id ON user_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_card_id ON user_cards(card_id);