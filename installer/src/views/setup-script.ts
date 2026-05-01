// Setup form's external script. Kept out of the inline-script CSP bucket
// (script-src 'self' only allows loaded files, not <script>...</script>).
// Handles:
//   - reactive API-key label + help link based on selected profile
//   - "use custom" disclosure: deselects presets when opened, restores prior
//     preset on collapse, auto-closes when a preset is clicked
//   - show/hide toggle for the API key field
//   - submit-pending state (spinner + disabled button)

export function setupScriptJs(): string {
  return `(() => {
  const radios = document.querySelectorAll('input[name="profile"]');
  const customToggle = document.getElementById('custom-toggle');
  const customProvider = document.getElementById('custom_provider');
  const apiKey = document.getElementById('api_key');
  const apiKeyLabel = document.getElementById('api_key_label');
  const apiKeyHelpLink = document.getElementById('api_key_help_link');
  const apiKeyToggleBtn = document.getElementById('api_key_toggle');
  const form = document.getElementById('install-form');
  const submitBtn = document.getElementById('submit-btn');

  const ANTHROPIC_HELP = 'https://console.anthropic.com/settings/keys';
  const OPENAI_HELP = 'https://platform.openai.com/api-keys';

  function selectedProfile() {
    return Array.from(radios).find((r) => r.checked);
  }

  function update() {
    const r = selectedProfile();
    const isCustom = !r; // when no preset is checked we're in custom mode
    let provider, helpUrl;
    if (isCustom) {
      provider = customProvider.value;
      helpUrl = provider === 'openai' ? OPENAI_HELP : ANTHROPIC_HELP;
    } else {
      provider = r.dataset.provider;
      helpUrl = r.dataset.help;
    }
    apiKeyLabel.textContent = provider === 'openai' ? 'OpenAI API key' : 'Anthropic API key';
    apiKey.placeholder = provider === 'openai' ? 'sk-…' : 'sk-ant-…';
    apiKeyHelpLink.href = helpUrl;
    apiKeyHelpLink.textContent = helpUrl.replace(/^https?:\\/\\//, '').replace(/\\/.*$/, '');
  }

  // The disclosure is the source of truth for "use custom instead". When it
  // opens, we uncheck preset radios so the form will post profile=custom.
  // When the user instead clicks a preset card while custom is open, our
  // change handler closes the disclosure programmatically and sets
  // \`closingDueToPresetClick\` so the toggle handler skips its restore logic.
  // (Without this flag we'd race against browser toggle-event ordering and
  // sometimes overwrite the user's just-made selection with the default.)
  let presetBeforeCustom = null;
  let closingDueToPresetClick = false;
  customToggle.addEventListener('toggle', () => {
    if (customToggle.open) {
      presetBeforeCustom = Array.from(radios).find((r) => r.checked) || null;
      radios.forEach((r) => { r.checked = false; });
    } else if (closingDueToPresetClick) {
      // User just picked a preset; keep it. Do nothing.
      closingDueToPresetClick = false;
      presetBeforeCustom = null;
    } else {
      // User collapsed the disclosure manually without picking. Restore.
      const aPresetIsChecked = Array.from(radios).some((r) => r.checked);
      if (!aPresetIsChecked) {
        const restore = presetBeforeCustom || radios[0];
        if (restore) restore.checked = true;
      }
      presetBeforeCustom = null;
    }
    update();
  });

  // The form's "profile" field needs to be "custom" when the disclosure is
  // open and no preset is checked. We inject a hidden field at submit time.
  form.addEventListener('submit', (ev) => {
    if (customToggle.open && !selectedProfile()) {
      const customModel = document.getElementById('custom_model');
      if (!customModel.value.trim()) {
        ev.preventDefault();
        customModel.focus();
        customModel.setCustomValidity('Enter a model id, or pick a preset profile above.');
        customModel.reportValidity();
        return;
      }
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'profile';
      hidden.value = 'custom';
      form.appendChild(hidden);
    }
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Installing on selected repos…';
  });

  // Clear the custom-model validation error as the user types.
  document.getElementById('custom_model').addEventListener('input', (ev) => {
    ev.target.setCustomValidity('');
  });

  radios.forEach((r) => r.addEventListener('change', () => {
    if (customToggle.open) {
      closingDueToPresetClick = true;
      customToggle.open = false;
    }
    update();
  }));
  customProvider.addEventListener('change', update);

  // Show/hide for API key
  apiKeyToggleBtn.addEventListener('click', () => {
    const showing = apiKey.type === 'text';
    apiKey.type = showing ? 'password' : 'text';
    apiKeyToggleBtn.textContent = showing ? 'Show' : 'Hide';
    apiKeyToggleBtn.setAttribute('aria-label', showing ? 'Show API key' : 'Hide API key');
  });

  update();
})();
`;
}
