-- =============================================================================
-- JOKER RPG — MIGRAÇÃO 007: Temporadas Competitivas e Classificações (Rankings)
-- =============================================================================

-- 1. Tabela de Temporadas Competitivas
CREATE TABLE IF NOT EXISTS seasons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'UPCOMING' CHECK (status IN ('UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED')),
    rewards JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_season_dates CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS idx_seasons_status ON seasons(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_seasons_dates ON seasons(start_date, end_date) WHERE deleted_at IS NULL;

-- 2. Tabela de Classificação dos Jogadores (Global e por Temporada)
CREATE TABLE IF NOT EXISTS rankings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    season_id UUID REFERENCES seasons(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL DEFAULT 1000 CHECK (rating >= 0),
    wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
    losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
    power_index INTEGER NOT NULL DEFAULT 0 CHECK (power_index >= 0),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_season_ranking UNIQUE (user_id, season_id)
);

CREATE INDEX IF NOT EXISTS idx_rankings_rating_desc ON rankings(rating DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_user_id ON rankings(user_id);
CREATE INDEX IF NOT EXISTS idx_rankings_season_id ON rankings(season_id);
CREATE INDEX IF NOT EXISTS idx_rankings_power_desc ON rankings(power_index DESC);