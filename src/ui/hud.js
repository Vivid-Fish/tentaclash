// DOM overlay only. It never touches the sim or three.js: `update(view)` takes the
// plain view object. Deliberately sparse — the arena should show the grip, not a
// dashboard. The two things kept here are fuel (a bar, not a number) and the grip
// position (the one number that is the sport).

import { armBlurb } from '../sim/arms.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const els = {
    hud: $('hud'), menu: $('menu'), pick: $('pick'), result: $('result'),
    round: $('round-tag'), opponent: $('opponent-tag'), clock: $('clock'),
    fuelYou: $('fuel-you'), fuelOpp: $('fuel-opp'),
    needle: $('grip-needle'), tell: $('tell-ring'), call: $('call'),
    armGrid: $('arm-grid'), vs: $('vs'),
    resultTitle: $('result-title'), resultLine: $('result-line'),
    resultStats: $('result-stats'), next: $('next'),
  };

  let callTimer = 0;

  function call(text, ms = 1200) {
    els.call.textContent = text;
    els.call.classList.add('show');
    clearTimeout(callTimer);
    callTimer = setTimeout(() => els.call.classList.remove('show'), ms);
  }

  return {
    call,

    showMenu() { els.menu.hidden = false; els.hud.hidden = true; els.pick.hidden = true; els.result.hidden = true; },
    showPick() { els.pick.hidden = false; els.result.hidden = true; },
    hideOverlays() { els.menu.hidden = els.pick.hidden = els.result.hidden = true; els.hud.hidden = false; },

    startRound({ round, opponent }) {
      els.round.textContent = `Round ${round + 1} of 5`;
      els.opponent.innerHTML = `<b>${opponent.name}</b> · ${opponent.species}`;
      els.hud.hidden = false;
    },

    /** Build the arm picker. Fatigue is shown as a bar, not a percentage. */
    chooseArm({ round, opponent, options }) {
      els.vs.innerHTML = `Round ${round + 1}: <b>${opponent.name}</b> — ${opponent.teaches}`;
      els.armGrid.textContent = '';
      for (const { arm, fatigue, stamina, staminaMax } of options) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'arm-card';
        const pct = Math.round(100 * (stamina / staminaMax));
        card.innerHTML = `<h3>${arm.name}</h3><div class="blurb">${armBlurb(arm)}</div>
          <i class="bar${pct < 70 ? ' tired' : ''}"><i style="width:${pct}%"></i></i>`;
        els.armGrid.appendChild(card);
      }
      els.pick.hidden = false;
      return new Promise((resolve) => {
        const cards = [...els.armGrid.children];
        cards.forEach((card, i) => {
          card.onclick = () => { els.pick.hidden = true; resolve(options[i]); };
        });
      });
    },

    showResult({ won, opponent, stats, nextLabel, onNext }) {
      els.resultTitle.textContent = won ? 'You take the grip' : `${opponent.name} takes the grip`;
      els.resultTitle.style.color = won ? 'var(--ok)' : 'var(--bad)';
      els.resultLine.textContent = stats.line;
      els.resultStats.textContent = stats.detail;
      els.next.textContent = nextLabel;
      els.next.onclick = onNext;
      els.result.hidden = false;
      els.hud.hidden = true;
    },

    /** Plain view data in, pixels out. Nothing here knows the rules. */
    update(view) {
      const secs = Math.max(0, Math.ceil(view.clock));
      els.clock.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

      const youPct = Math.round(100 * view.you.stamina);
      const oppPct = Math.round(100 * view.opp.stamina);
      els.fuelYou.firstElementChild.style.width = `${youPct}%`;
      els.fuelOpp.firstElementChild.style.width = `${oppPct}%`;
      els.fuelYou.classList.toggle('low', youPct < 25);
      els.fuelOpp.classList.toggle('low', oppPct < 25);

      els.needle.style.left = `${((view.angle + 1) / 2) * 100}%`;
      els.tell.classList.toggle('hot', view.opp.tell > 0.62);
    },
  };
}
