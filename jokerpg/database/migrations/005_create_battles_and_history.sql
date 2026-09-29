-- =============================================================================
-- JOKER RPG — MIGRAÇÃO 005: Batalhas, Participantes e Histórico Telemétrico
-- =============================================================================

-- 1. Tabela Principal de Sessões de Batalha (PvE e PvP)
CREATE TABLE IF NOT EXISTS battles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mode VARCHAR(30) NOT NULL CHECK (mode IN ('PVE_TRAINING', 'PVP_CASUAL', 'PVP_RANKED')),
    status VARCHAR(30) NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'IN_PROGRESS', 'FINISHED', 'ABANDONED')),
    winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    loser_id UUID REFERENCES users(id) ON DELETE SET NULL,
    total_turns INTEGER NOT NULL DEFAULT 0 CHECK (total_turns >= 0),
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_battles_status ON battles(status);
CREATE INDEX IF NOT EXISTS idx_battles_winner ON battles(winner_id);
CREATE INDEX IF NOT EXISTS idx_battles_loser ON battles(loser_id);
CREATE INDEX IF NOT EXISTS idx_battles_created_at ON battles(created_at DESC);

-- 2. Snapshot dos Jogadores e Personagens Participantes da Partida
CREATE TABLE IF NOT EXISTS battle_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
    initial_hp INTEGER NOT NULL CHECK (initial_hp > 0),
    initial_power INTEGER NOT NULL CHECK (initial_power >= 0),
    CONSTRAINT uq_battle_player UNIQUE (battle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_battle_players_battle_id ON battle_players(battle_id);
CREATE INDEX IF NOT EXISTS idx_battle_players_user_id ON battle_players(user_id);

-- 3. Telemetria Detalhada de Ações por Turno (Replay, Auditoria e Validação)
CREATE TABLE IF NOT EXISTS battle_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
    turn_number INTEGER NOT NULL CHECK (turn_number >= 1),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(30) NOT NULL CHECK (action_type IN ('ATTACK', 'DEFENSE', 'BLOCK', 'DODGE', 'COUNTER', 'TECHNIQUE', 'SPECIAL', 'ULTIMATE', 'PASS')),
    card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
    damage_dealt INTEGER NOT NULL DEFAULT 0 CHECK (damage_dealt >= 0),
    break_dealt INTEGER NOT NULL DEFAULT 0 CHECK (break_dealt >= 0),
    was_critical BOOLEAN NOT NULL DEFAULT FALSE,
    combo_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.00 CHECK (combo_multiplier >= 1.00),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_battle_actions_battle_id ON battle_actions(battle_id);
CREATE INDEX IF NOT EXISTS idx_battle_actions_turn ON battle_actions(battle_id, turn_number);