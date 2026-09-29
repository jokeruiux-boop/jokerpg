-- =============================================================================
-- JOKER RPG — SEED 004: Inicialização Protegida do Administrador Supremo
-- =============================================================================

DO $$
DECLARE
    v_admin_id UUID;
    v_admin_username VARCHAR(50) := 'admin_supremo';
    v_admin_email VARCHAR(255) := 'admin@jokerpg.com';
    -- Hash Bcrypt (12 rounds) correspondente à chave padrão inicial
    v_password_hash VARCHAR(255) := '$2a$12$k2Q59x1x4s6fCeqeZ7sVOeaM4b1uO.h5sO0K4jT9VwS7D3d3k1gxe';
BEGIN
    -- 1. Verifica se o Administrador Supremo já existe pelo email ou username
    SELECT id INTO v_admin_id 
    FROM users 
    WHERE email = v_admin_email OR username = v_admin_username;

    -- 2. Cria o usuário caso ainda não esteja presente
    IF v_admin_id IS NULL THEN
        INSERT INTO users (
            username, 
            email, 
            role, 
            level, 
            xp, 
            coins, 
            power_index, 
            is_blocked
        ) VALUES (
            v_admin_username, 
            v_admin_email, 
            'ADMIN_SUPREMO', 
            99, 
            99999, 
            99999, 
            9999, 
            FALSE
        )
        RETURNING id INTO v_admin_id;

        -- 3. Registra as credenciais na tabela user_auth
        INSERT INTO user_auth (
            user_id, 
            password_hash
        ) VALUES (
            v_admin_id, 
            v_password_hash
        );

        -- 4. Registra log de inicialização na trilha de auditoria
        INSERT INTO admin_logs (
            admin_id, 
            action_name, 
            target_entity, 
            target_id, 
            ip_address, 
            details
        ) VALUES (
            v_admin_id, 
            'SYSTEM_BOOTSTRAP_ADMIN_CREATED', 
            'users', 
            v_admin_id::text, 
            '127.0.0.1', 
            '{"message": "Conta mestre ADMIN_SUPREMO gerada com sucesso via seed inicial."}'::jsonb
        );
    END IF;
END $$;