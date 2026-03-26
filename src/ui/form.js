/**
 * Credential form UI
 * Renders login fields for MultiSet client ID, secret, and map code.
 */

/**
 * @param {HTMLElement} container
 * @param {(creds: {clientId: string, clientSecret: string, mapCode: string}) => void} onSubmit
 */
export function renderForm(container, onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay form-overlay';
  overlay.id = 'form-overlay';

  overlay.innerHTML = `
    <div class="form-card">
      <h1>NAVME</h1>
      <p class="subtitle">Authenticate to access the control center</p>

      <form id="cred-form" autocomplete="off">
        <div class="form-group">
          <label for="client-id">Client ID</label>
          <input id="client-id" type="text" placeholder="Your MultiSet client ID" required />
        </div>

        <div class="form-group">
          <label for="client-secret">Client Secret</label>
          <input id="client-secret" type="password" placeholder="Your MultiSet client secret" required />
        </div>

        <div class="form-group">
          <label for="map-code">Map / MapSet Code</label>
          <input id="map-code" type="text" placeholder="MAP_... or MSET_..." required />
          <p class="help">Enter a map code (MAP_*) or map set code (MSET_*)</p>
        </div>

        <button type="submit" class="btn-start" id="btn-start">
          <span class="icon">🗺️</span>
          Load Map
        </button>
      </form>
    </div>
  `;

  container.appendChild(overlay);

  const form = overlay.querySelector('#cred-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const clientId = form.querySelector('#client-id').value.trim();
    const clientSecret = form.querySelector('#client-secret').value.trim();
    const mapCode = form.querySelector('#map-code').value.trim();
    if (clientId && clientSecret && mapCode) {
      onSubmit({ clientId, clientSecret, mapCode });
    }
  });

  return {
    hide() {
      overlay.style.transition = 'opacity 0.4s ease';
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 400);
    },
    disable() {
      form.querySelector('#btn-start').disabled = true;
    },
    enable() {
      form.querySelector('#btn-start').disabled = false;
    },
  };
}
