-- =============================================================================
-- JOKER RPG — MIGRAÇÃO 002: Catálogo Mestre de Personagens e Vínculos de Usuários
-- =============================================================================

-- 1. Catálogo Mestre de Personagens
CREATE TABLE IF NOT EXISTS characters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    rarity VARCHAR(30) NOT NULL CHECK (rarity IN ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC')),
    element VARCHAR(30) NOT NULL CHECK (element IN ('FIRE', 'WATER', 'WIND', 'EARTH', 'LIGHTNING', 'LIGHT', 'DARK')),
    class VARCHAR(30) NOT NULL CHECK (class IN ('ASSASSIN', 'WARRIOR', 'TANK', 'MAGE', 'SUPPORT')),
    base_hp INTEGER NOT NULL CHECK (base_hp > 0),
    attack INTEGER NOT NULL CHECK (attack >= 0),
    defense INTEGER NOT NULL CHECK (defense >= 0),
    speed INTEGER NOT NULL CHECK (speed >= 0),
    energy INTEGER NOT NULL DEFAULT 10 CHECK (energy > 0),
    critical_chance NUMERIC(5, 2) NOT NULL DEFAULT 5.00 CHECK (critical_chance >= 0 AND critical_chance <= 100),
    power_rating INTEGER NOT NULL DEFAULT 100 CHECK (power_rating >= 0),
    passive_ability JSONB NOT NULL DEFAULT '{}'::jsonb,
    active_ability JSONB NOT NULL DEFAULT '{}'::jsonb,
    ultimate_ability JSONB NOT NULL DEFAULT '{}'::jsonb,
    image_data BYTEA,
    image_mime VARCHAR(50),
    avatar_data BYTEA,
    avatar_mime VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_characters_rarity ON characters(rarity) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_characters_element ON characters(element) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_characters_class ON characters(class) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_characters_power ON characters(power_rating DESC) WHERE deleted_at IS NULL;

-- 2. Vínculo de Chave Estrangeira do Personagem Principal em Usuários
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_users_main_character'
    ) THEN
        ALTER TABLE users 
        ADD CONSTRAINT fk_users_main_character 
        FOREIGN KEY (main_character_id) 
        REFERENCES characters(id) 
        ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Coleção de Personagens Desbloqueados por Jogador
CREATE TABLE IF NOT EXISTS user_characters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
    xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    unlocked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_character UNIQUE (user_id, character_id)
);

CREATE INDEX IF NOT EXISTS idx_user_characters_user_id ON user_characters(user_id);
CREATE INDEX IF NOT EXISTS idx_user_characters_character_id ON user_characters(character_id);