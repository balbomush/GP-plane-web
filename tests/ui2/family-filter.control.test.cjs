const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { chromium } = require('playwright');
const { familyFilter, expectFamilyChoices, chooseFamily } = require('./spec/family-filter.cjs');

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function withControl(markup, run) {
  const page = await browser.newPage();
  try {
    await page.setContent('<label for="family">Тип стратегии</label>' + markup);
    await run(familyFilter(page), page);
  } finally {
    await page.close();
  }
}

const option = '<option value="">Все типы</option>';
const fake = '<option value="fake">Fake</option>';
const multi = '<option value="multisplit">Multisplit</option>';
const expected = ['', 'fake', 'multisplit'];

for (const [description, markup] of [
  ['empty native select', '<select id="family"></select>'],
  ['combobox without options', '<input id="family" role="combobox">'],
  ['input with empty datalist', '<input id="family" list="types"><datalist id="types"></datalist>'],
  ['hidden family option', '<select id="family">' + option + fake + multi.replace('<option', '<option hidden') + '</select>'],
  ['disabled option group', '<select id="family">' + option + fake + '<optgroup label="Hidden choices" disabled>' + multi + '</optgroup></select>'],
]) {
  test('Control rejects ' + description, () => withControl(markup, async control => {
    await assert.rejects(() => expectFamilyChoices(control, expected), /Expected one available family option/);
  }));
}

for (const [description, options] of [
  ['ambiguous family labels', option + fake.replace('>Fake<', '>Fake + Multisplit<') +
    multi.replace('>Multisplit<', '>Fake + Multisplit<')],
  ['misleading reset label', option.replace('Все типы', 'Fake') + fake + multi],
]) {
  test('Control rejects ' + description, () => withControl(
    '<select id="family">' + options + '</select>', async control => {
      await assert.rejects(() => expectFamilyChoices(control, expected), /identifiable by its option label/);
    }));
}

test('Control selects and resets accessible native options and emits change', () =>
  withControl('<select id="family">' + option + fake + multi +
    '</select><output aria-label="Chosen family"></output>', async (control, page) => {
    await page.evaluate(() => {
      document.querySelector('select').addEventListener('change', event => {
        document.querySelector('output').textContent = event.target.value || 'all';
      });
    });
    assert.deepEqual((await expectFamilyChoices(control, expected)).map(item => item.value), expected);
    const output = page.getByLabel('Chosen family');
    await chooseFamily(control, 'multisplit');
    assert.equal(await output.textContent(), 'multisplit');
    await chooseFamily(control, '');
    assert.equal(await output.textContent(), 'all');
  }));
