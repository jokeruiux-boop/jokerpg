-- =============================================================================
-- JOKER RPG — MIGRAÇÃO 006: Catálogo de Missões e Progresso dos Jogadores
-- =============================================================================

-- 1. Catálogo Mestre de Missões do Jogo
CREATE TABLE IF NOT EXISTS missions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(30) NOT NULL CHECK (category IN ('DAILY', 'BATTLE', 'PROGRESSION')),
    requirement_type VARCHAR(50) NOT NULL CHECK (requirement_type IN (
        'WIN_BATTLES', 
        'PLAY_CARDS', 
        'EXECUTE_COMBOS', 
        'BREAK_POSTURE', 
        'USE_DEFENSE', 
        'DEAL_DAMAGE'
    )),
    requirement_count INTEGER NOT NULL CHECK (requirement_count > 0),
    reward_xp INTEGER NOT NULL DEFAULT 0 CHECK (reward_xp >= 0),
    reward_coins INTEGER NOT NULL DEFAULT 0 CHECK (reward_coins >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_missions_category ON missions(category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_missions_requirement_type ON missions(requirement_type) WHERE deleted_at IS NULL;

-- 2. Progresso Individual de Missões por Jogador
CREATE TABLE IF NOT EXISTS user_missions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    current_progress INTEGER NOT NULL DEFAULT 0 CHECK (current_progress >= 0),
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    claimed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_mission UNIQUE (user_id, mission_id)
);

CREATE INDEX IF NOT EXISTS idx_user_missions_user_id ON user_missions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_missions_status ON user_missions(user_id, is_completed);