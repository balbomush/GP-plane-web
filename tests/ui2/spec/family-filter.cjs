const assert = require('node:assert/strict');

function familyFilter(page) {
  // The accepted current API 2 mockup uses a single native select.
  return page.getByLabel('Тип стратегии', { exact: true });
}

async function availableFamilies(control) {
  await control.waitFor({ state: 'visible' });
  assert(await control.isEnabled(), 'Family filter must be enabled');
  return control.evaluate(element => {
    if (!(element instanceof HTMLSelectElement) || element.multiple || element.size > 1) return [];
    return [...element.options].filter(option => {
      if (option.matches(':disabled') || option.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
      for (const node of [option, option.closest('optgroup'), element].filter(Boolean)) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility !== 'visible' || style.opacity === '0') return false;
      }
      return option.label.trim() !== '';
    }).map(option => ({ value: option.value, label: option.label.trim() }));
  });
}

async function expectFamilyChoices(control, expected) {
  const options = await availableFamilies(control);
  for (const value of expected) {
    const matches = options.filter(option => option.value === value);
    assert.equal(matches.length, 1, 'Expected one available family option ' + JSON.stringify(value));
    const expectedLabel = value || 'Все типы';
    const normalized = label => label.replace(/\s+/g, ' ').trim().toLowerCase();
    assert.equal(normalized(matches[0].label), normalized(expectedLabel),
      'Family must be identifiable by its option label: ' + expectedLabel);
    assert.equal(options.filter(option => normalized(option.label) === normalized(expectedLabel)).length,
      1, 'Family label must distinguish a single option: ' + expectedLabel);
  }
  return options;
}

async function chooseFamily(control, value) {
  const options = await expectFamilyChoices(control, [value]);
  const { label } = options.find(option => option.value === value);
  await control.selectOption({ value, label });
  assert.equal(await control.inputValue(), value);
  assert.equal(await control.locator('option:checked').evaluate(option => option.label.trim()), label);
}

module.exports = { familyFilter, expectFamilyChoices, chooseFamily };
