/**
 * Language selector component for the 天下太平 website
 * Allows users to switch between available languages
 */

import i18n from './i18n.js';

/**
 * Creates and initializes a language selector dropdown
 * @param {string} containerId - ID of the container element for the language selector
 */
function createLanguageSelector(containerId = 'language-selector') {
  // Get container element
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container element with ID "${containerId}" not found.`);
    return;
  }
  
  // Get available languages
  const languages = i18n.getAvailableLanguages();
  const currentLang = i18n.getCurrentLanguage();
  
  // Create selector element
  const selectorWrapper = document.createElement('div');
  selectorWrapper.className = 'language-selector-wrapper';
  
  // Create dropdown
  const select = document.createElement('select');
  select.id = 'language-select';
  select.className = 'language-select';
  
  // Add options for each language
  Object.entries(languages).forEach(([code, name]) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    option.selected = code === currentLang;
    select.appendChild(option);
  });
  
  // Add change event listener
  select.addEventListener('change', (e) => {
    const newLang = e.target.value;
    i18n.setLanguage(newLang);
  });
  
  // Create language label
  const label = document.createElement('label');
  label.htmlFor = 'language-select';
  label.className = 'language-label';
  label.textContent = 'Language: ';
  
  // Append elements
  selectorWrapper.appendChild(label);
  selectorWrapper.appendChild(select);
  container.appendChild(selectorWrapper);
}

export { createLanguageSelector }; 