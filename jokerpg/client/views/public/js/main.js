/**
 * Joker RPG — Script Client-Side Central (main.js)
 * Utilitários de interface, síntese sonora de combate via Web Audio API,
 * confirmações de segurança e gerenciamento do drawer de navegação mobile.
 */

(function () {
  'use strict';

  // 1. Motor de Efeitos Sonoros Táticos Sintetizados (Web Audio API nativa sem dependência de MP3)
  const AudioEngine = {
    ctx: null,
    enabled: true,

    init() {
      if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
    },

    ensureContext() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    },

    playTone(frequency, type, duration, gainValue = 0.1) {
      if (!this.enabled) return;
      try {
        this.ensureContext();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);

        gain.gain.setValueAtTime(gainValue, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (e) {
        // Silencia falhas de áudio em navegadores com autoplay restrito
      }
    },

    playUiClick() {
      this.playTone(800, 'sine', 0.08, 0.05);
    },

    playCardSelect() {
      this.playTone(520, 'triangle', 0.12, 0.08);
    },

    playAttack() {
      this.playTone(220, 'sawtooth', 0.25, 0.12);
    },

    playCritical() {
      if (!this.enabled) return;
      this.ensureContext();
      if (!this.ctx) return;
      this.playTone(300, 'sawtooth', 0.1, 0.15);
      setTimeout(() => this.playTone(600, 'sawtooth', 0.35, 0.2), 80);
    },

    playBreak() {
      if (!this.enabled) return;
      this.ensureContext();
      if (!this.ctx) return;
      this.playTone(180, 'square', 0.15, 0.15);
      setTimeout(() => this.playTone(90, 'sawtooth', 0.4, 0.25), 100);
    },

    playVictory() {
      const notes = [440, 554, 659, 880];
      notes.forEach((freq, idx) => {
        setTimeout(() => this.playTone(freq, 'triangle', 0.3, 0.12), idx * 120);
      });
    },

    playDefeat() {
      const notes = [350, 310, 260, 200];
      notes.forEach((freq, idx) => {
        setTimeout(() => this.playTone(freq, 'sine', 0.4, 0.12), idx * 140);
      });
    }
  };

  // 2. Interações de Interface do Usuário
  document.addEventListener('DOMContentLoaded', () => {
    // 2.1 Auto-fechamento de alertas flash
    const alerts = document.querySelectorAll('.joker-alert-dismissible');
    alerts.forEach((alert) => {
      setTimeout(() => {
        alert.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        alert.style.opacity = '0';
        alert.style.transform = 'translateY(-10px)';
        setTimeout(() => alert.remove(), 400);
      }, 5000);
    });

    // 2.2 Efeitos sonoros ao clicar em botões táticos
    const buttons = document.querySelectorAll('.btn-joker, .joker-nav-link');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => AudioEngine.playUiClick());
    });

    // 2.3 Diálogo de confirmação para ações destrutivas ou críticas
    const confirmButtons = document.querySelectorAll('[data-confirm]');
    confirmButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const message = btn.getAttribute('data-confirm') || 'Deseja realmente confirmar esta ação?';
        if (!window.confirm(message)) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      });
    });

    // 2.4 Alternador de Sidebar Mobile
    const sidebarToggle = document.getElementById('jokerSidebarToggle');
    const sidebar = document.getElementById('jokerSidebar');

    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('show');
        AudioEngine.playUiClick();
      });

      document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
          sidebar.classList.remove('show');
        }
      });
    }
  });

  // Exposição de utilitários no namespace global
  window.Joker = {
    Audio: AudioEngine,
    copyToClipboard(text, successCallback) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          if (typeof successCallback === 'function') successCallback();
        });
      }
    }
  };
})();