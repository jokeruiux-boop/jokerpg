-- =============================================================================
-- JOKER RPG — SEED 003: Catálogo Canônico Inicial de Missões
-- =============================================================================

INSERT INTO missions (
    title, 
    description, 
    category, 
    requirement_type, 
    requirement_count, 
    reward_xp, 
    reward_coins
)
SELECT 'Primeira Vitória do Dia', 'Vença ao menos 1 batalha em qualquer modo da arena tática.', 'DAILY', 'WIN_BATTLES', 1, 100, 50
WHERE NOT EXISTS (SELECT 1 FROM missions WHERE title = 'Primeira Vitória do Dia');

INSERT INTO missions (
    title, 
    description, 
    category, 
    requirement_type, 
    requirement_count, 
    reward_xp, 
    reward_coins
)
SELECT 'Postura Inflexível', 'Execute 5 ações defensivas com sucesso (Block, Dodge ou Counter) em combate.', 'DAILY', 'USE_DEFENSE', 5, 80, 40
WHERE NOT EXISTS (SELECT 1 FROM missions WHERE title = 'Postura Inflexível');

INSERT INTO missions (
    title, 
    description, 
    category, 
    requirement_type, 
    requirement_count, 
    reward_xp, 
    reward_coins
)
SELECT 'Arsenal em Ação', 'Jogue um total de 15 cartas táticas durante seus confrontos diários.', 'DAILY', 'PLAY_CARDS', 15, 90, 45
WHERE NOT EXISTS (SELECT 1 FROM missions WHERE title = 'Arsenal em Ação');

INSERT INTO missions (
    title, 
    description, 
    category, 
    requirement_type, 
    requirement_count, 
    reward_xp, 
    reward_coins
)
SELECT 'Mestre do Ritmo', 'Execute sequências de combos alcançando multiplicador Combo x3 ou superior por 3 vezes.', 'BATTLE', 'EXECUTE_COMBOS', 3, 150, 80
WHERE NOT EXISTS (SELECT 1 FROM missions WHERE title = 'Mestre do Ritmo');

INSERT INTO missions (
    title, 
    description, 
    category, 
    requirement_type, 
    requirement_count, 
    reward_xp, 
    reward_coins
)
SELECT 'Fratura Implacável', 'Esgote completamente a barra de postura (Break Gauge) do oponente por 2 vezes.', 'BATTLE', 'BREAK_POSTURE', 2, 180, 100
WHERE NOT EXISTS (SELECT 1 FROM missions WHERE title = 'Fratura Implacável');

INSERT INTO missions (
    title, 
    description, 
    category, 
    requirement_type, 
    requirement_count, 
    reward_xp, 
    reward_coins
)
SELECT 'Poder Ofensivo', 'Cause um total acumulado de 2.500 pontos de dano a oponentes na arena.', 'BATTLE', 'DEAL_DAMAGE', 2500, 200, 120
WHERE NOT EXISTS (SELECT 1 FROM missions WHERE title = 'Poder Ofensivo');

INSERT INTO missions (
    title, 
    description, 
    category, 
    requirement_type, 
    requirement_count, 
    reward_xp, 
    reward_coins
)
SELECT 'Gladiador Consagrado', 'Acumule 10 vitórias totais nas batalhas da arena de combate.', 'PROGRESSION', 'WIN_BATTLES', 10, 500, 300
WHERE NOT EXISTS (SELECT 1 FROM missions WHERE title = 'Gladiador Consagrado');

INSERT INTO missions (
    title, 
    description, 
    category, 
    requirement_type, 
    requirement_count, 
    reward_xp, 
    reward_coins
)
SELECT 'Demolidor de Postura', 'Quebre a postura de oponentes 15 vezes ao longo de sua trajetória.', 'PROGRESSION', 'BREAK_POSTURE', 15, 600, 400
WHERE NOT EXISTS (SELECT 1 FROM missions WHERE title = 'Demolidor de Postura');

INSERT INTO missions (
    title, 
    description, 
    category, 
    requirement_type, 
    requirement_count, 
    reward_xp, 
    reward_coins
)
SELECT 'Lenda do Combate', 'Desfira um dano acumulado histórico de 10.000 pontos em batalhas táticas.', 'PROGRESSION', 'DEAL_DAMAGE', 10000, 800, 500
WHERE NOT EXISTS (SELECT 1 FROM missions WHERE title = 'Lenda do Combate');