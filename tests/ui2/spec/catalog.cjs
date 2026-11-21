const {familyFilter, chooseFamily} = require('./family-filter.cjs');
const {add,until,confirm,catalog,archive,hash,assert,fs,path,getError}=require('./common.cjs');
const prepare=s=>{const base=s.strategies[0];s.strategies=[{...base,id:'g-a',protocol:'tls',family:'multisplit',family_rank:1,args:'--exact "same args"',results:[{id:1,domain:'youtube.com',engines:[{id:1,code:'blockcheck2-gp',name:'GP source'}]}]},{...base,id:'g-b',protocol:'tls',family:'multisplit',family_rank:1,args:'--exact "same args"',results:[{id:2,domain:'discord.com',engines:[{id:2,code:'blockcheck2',name:'Stock source'}]}]},{...base,id:'g-c',protocol:'tls',family:'fake',family_rank:0,args:'--fake',results:[{id:3,domain:'youtube.com',engines:[{id:1,code:'blockcheck2-gp',name:'GP source'},{id:2,code:'blockcheck2',name:'Stock source'}]},{id:4,domain:'discord.com',engines:[]}]},{...base,id:'g-d',protocol:'quic',family:'unknown',family_rank:null,family_reason:'',args:'--unknown',archive_available:false,results:[{id:5,domain:'other.example',engines:[]}]}];s.strategiesByMilestone={0:{'g-a':[{id:11,domain:'historic.example',engines:[]}]}};};
add('catalog-groups','catalog.group','Loaded page is grouped by adjacent protocol/family, group labels/counts do not expose IDs/ranks',async c=>{await catalog(c);const groups=c.page.locator('details').filter({has:c.page.locator('[data-strategy]')});assert.equal(await groups.count(),3,'Expected 3 collapsible protocol/family groups');const texts=await groups.locator('summary').allTextContents();assert.match(texts.join(' '),/unknown/i);assert.match(texts.join(' '),/multisplit/i);assert.match(texts.join(' '),/fake/i);assert(!texts.some(x=>/g-[abcd]|rank|оценка качества/i.test(x)));},{prepare});
add('catalog-collapse','catalog.collapse','Group header collapses/reopens rows with click and keyboard without changing selection or requests',async c=>{await catalog(c);const group=c.page.locator('details').filter({has:c.page.locator('[data-strategy="g-a"]')});assert.equal(await group.count(),1,'No collapsible group for multisplit');const head=group.locator('summary');if(!await group.evaluate(e=>e.open))await head.click();await c.page.locator('[data-strategy="g-a"]').click();const calls=c.call('listStrategies').length;await head.click();assert.equal(await c.page.locator('[data-strategy="g-a"]').isVisible(),false);await head.focus();await c.page.keyboard.press('Enter');assert(await c.page.locator('[data-strategy="g-a"]').isVisible());assert.equal(c.call('listStrategies').length,calls);assert.equal(await c.page.locator('[data-strategy="g-a"]').getAttribute('aria-pressed'),'true');},{prepare});
add('catalog-domains','catalog.domain-names catalog.domain-identity','Equal count/different domains distinguish rows before opening details',async c=>{await catalog(c);for(const [id,domain]of [['g-a','youtube.com'],['g-b','discord.com']])await c.check('catalog.domain-names',id+' visibly identifies '+domain,async()=>{const row=c.page.locator('[data-strategy="'+id+'"]');assert((await row.innerText()).includes(domain));assert.equal(c.call('getStrategy').length,0);});assert.notEqual(await c.page.locator('[data-strategy="g-a"]').innerText(),await c.page.locator('[data-strategy="g-b"]').innerText(),'Equal args/count must not make rows indistinguishable');},{prepare});
add('catalog-order','results.05 results.07 catalog.page-identity','Both sort modes preserve exact server order, separate identical args and append80unique records',async c=>{await catalog(c);assert.deepEqual(await c.page.locator('[data-strategy]').evaluateAll(es=>es.map(e=>e.dataset.strategy)),Array.from({length:50},(_,i)=>'p-'+String(i).padStart(3,'0')));await c.button('Загрузить ещё стратегии').click();await until(async()=>assert.equal(await c.page.locator('[data-strategy]').count(),80));assert.deepEqual(await c.page.locator('[data-strategy]').evaluateAll(es=>es.map(e=>e.dataset.strategy)),Array.from({length:80},(_,i)=>'p-'+String(i).padStart(3,'0')));assert.equal(c.call('listStrategies')[1].query.offset,'50');await c.openCatalogFilters();await c.label('Порядок').selectOption('id');await c.button('Применить фильтры').click();await until(()=>assert.equal(c.call('listStrategies').at(-1).query.sort,'id'));assert.equal(c.call('listStrategies').at(-1).query.offset,'0');assert(!/p-000/.test(await c.page.locator('[data-strategy="p-000"]').innerText()));},{prepare:s=>{const b=s.strategies[0];s.strategies=Array.from({length:80},(_,i)=>({...b,id:'p-'+String(i).padStart(3,'0'),protocol:'tls',family:i<45?'fake':'multisplit',family_rank:i<45?0:1,args:i<2?'--identical':'--id '+i}));}});
add('catalog-group-append','catalog.group catalog.page-identity','Page crossing family boundary extends existing group instead of splitting/reordering',async c=>{await catalog(c);await c.button('Загрузить ещё стратегии').click();await until(async()=>assert.equal(await c.page.locator('[data-strategy]').count(),80));const groups=c.page.locator('details').filter({has:c.page.locator('[data-strategy]')});assert.equal(await groups.count(),2);assert.deepEqual(await groups.evaluateAll(gs=>gs.map(g=>g.querySelectorAll('[data-strategy]').length)),[45,35]);},{prepare:s=>{const b=s.strategies[0];s.strategies=Array.from({length:80},(_,i)=>({...b,id:'p-'+String(i).padStart(3,'0'),protocol:'tls',family:i<45?'fake':'multisplit',family_rank:i<45?0:1}));}});
add('catalog-filters', 'results.02 results.04 results.06',
  'Check engine per domain, match, protocol and argument query before combining with a selected family',
  async c => {
    await catalog(c);
    const queries = () => c.call('listStrategies');
    const rows = c.page.locator('[data-strategy]');
    async function apply(expected, expectedIds) {
      const before = queries().length;
      await c.button('Применить фильтры').click();
      await until(() => assert(queries().length > before));
      const request = queries().at(-1);
      assert.deepEqual(request.queryEntries.filter(([key]) => key === 'domains'),
        [['domains', 'youtube.com'], ['domains', 'discord.com']]);
      for (const [key, value] of Object.entries(expected)) assert.equal(request.query[key], value, key);
      await until(async () => assert.deepEqual(
        await rows.evaluateAll(elements => elements.map(row => row.dataset.strategy)), expectedIds));
      if (!expectedIds.length) await c.text('Ничего не найдено');
      else await c.page.locator('[data-strategy="' + expectedIds[0] + '"]').waitFor({ state: 'visible' });
    }

    await c.label('Домены фильтра').fill('youtube.com discord.com');
    await c.label('Домены фильтра').press('Enter');
    await c.openCatalogFilters();await c.label('Совпадение доменов').selectOption('all');
    await c.openCatalogFilters();await c.label('Движок результатов').selectOption('blockcheck2-gp');
    const engine = { engine_code: 'blockcheck2-gp', offset: '0' };
    await c.check('results.02', 'Engine per domain with match=all yields no rows', () =>
      apply({ ...engine, match: 'all' }, []));
    await c.openCatalogFilters();await c.label('Совпадение доменов').selectOption('any');
    await c.openCatalogFilters();await c.label('Протокол').selectOption('tls');
    await c.check('results.02 results.04', 'match=any with TLS returns the exact eligible IDs', () =>
      apply({ ...engine, match: 'any', protocol: 'tls' }, ['g-c', 'g-a']));
    await c.openCatalogFilters();await c.label('Аргументы содержат').fill('--fake');
    const filtered = { ...engine, match: 'any', protocol: 'tls', q: '--fake' };
    await c.check('results.06', 'The argument substring narrows the result to g-c', () =>
      apply(filtered, ['g-c']));

    let selected = false;
    await c.check('results.04', 'The user can choose fake while the other filters are set', async () => {
      await chooseFamily(familyFilter(c.page), 'fake');
      selected = true;
    });
    if (!selected) return;
    await c.check('results.04', 'Combined request keeps family and every other filter with the exact resulting ID', () =>
      apply({ ...filtered, family: 'fake' }, ['g-c']));
  }, {prepare});
add('catalog-milestone','results.03 results.08','Milestone0 scopes list/detail without changing current Core; full detail not reduced to list filter',async c=>{await catalog(c);await c.label('Веха результатов').selectOption('0');await c.button('Применить фильтры').click();await c.visible(c.page.locator('[data-strategy="g-a"]'));assert.equal(await c.page.locator('[data-strategy]').count(),1);await c.page.locator('[data-strategy="g-a"]').click();await c.text('historic.example');assert.equal(c.call('getStrategy').at(-1).query.milestone_id,'0');assert.equal(c.state.milestone,3);assert.equal(c.call('createMilestone').length,0);assert.equal(c.call('listStrategies').at(-1).query.offset,'0');},{prepare});
add('catalog-detail','results.08 results.09 results.10','Detail has full exact args, both independent domain engine sets, unknown source and explanation',async c=>{await catalog(c);await c.page.locator('[data-strategy="g-c"]').click();await c.visible(c.page.locator('[data-selected-args]'));assert.equal(await c.page.locator('[data-selected-args]').innerText(),'--fake');const detail=c.page.getByRole('region',{name:'Подробности результата'}).or(c.page.locator('section[aria-label="Подробности результата"]'));assert((await detail.innerText()).includes('youtube.com'));const line=detail.locator('p').filter({hasText:'youtube.com'});assert((await line.innerText()).includes('GP source'));assert((await line.innerText()).includes('Stock source'));const other=detail.locator('p').filter({hasText:'discord.com'});assert.match(await other.innerText(),/неизвест|не указан/i);await detail.locator('summary').click();await c.text('Разделение потока');assert(!/g-c/.test(await detail.innerText()));},{prepare});
for(const op of ['listStrategies','getStrategy','downloadStrategy'])add('catalog-error-'+op,'results.15','Error '+op+' is visible, filters survive and retry can succeed without false empty/download',async c=>{await catalog(c);if(op!=='listStrategies')await c.page.locator('[data-strategy="g-a"]').click();c.fault(op,op==='downloadStrategy'?409:503,op==='downloadStrategy'?'archive_incomplete':'storage_unavailable','Проверяемый отказ '+op);let downloads=0;c.page.on('download',()=>downloads++);if(op==='listStrategies')await c.button('Применить фильтры').click();else if(op==='getStrategy')await c.page.locator('[data-strategy="g-b"]').click();else await c.button('Скачать ZIP стратегии').click();await c.text('Проверяемый отказ '+op);assert.equal(downloads,0);assert.equal(await c.page.getByText('Ничего не найдено',{exact:true}).count(),0);delete c.state.faults[op];if(op==='listStrategies'){await c.button('Применить фильтры').click();await c.visible(c.page.locator('[data-strategy="g-a"]'));}},{prepare});
add('catalog-preset','results.01 catalog.picker','Preset fully replaces chosen domain set; suggestions only loaded data; keyboard chips and unknown manual domain',async c=>{await catalog(c);await c.openCatalogFilters();await c.label('Список для фильтра').selectOption('1');await c.visible(c.button('Убрать домен d66.example'));const n=c.call('getDomainListEntries').length;const input=c.page.getByRole('combobox',{name:'Домены фильтра'});await input.fill('youtube');await input.press('ArrowDown');await input.press('Enter');await c.visible(c.button('Убрать домен youtube.com'));await input.fill('own-unknown.example');await input.press('Enter');await c.visible(c.button('Убрать домен own-unknown.example'));await c.button('Убрать домен d0.example').click();await c.button('Применить фильтры').click();await until(()=>assert(c.call('listStrategies').at(-1).queryEntries.some(([k,v])=>k==='domains'&&v==='own-unknown.example')));assert.equal(c.call('getDomainListEntries').length,n);assert(!c.state.requests.some(r=>r.path.includes('autocomplete')));},{prepare});
for(const op of ['listBundles','getBundle','downloadBundle'])add('bundle-error-'+op,'bundles.07','Bundle '+op+' failure is not empty/saved; selection filters and retry remain',async c=>{await c.nav('Результаты');await c.button('Комплекты').click();await c.visible(c.page.locator('[data-bundle="1"]'));if(op==='downloadBundle')await c.page.locator('[data-bundle="1"]').click();c.fault(op,op==='downloadBundle'?409:503,op==='downloadBundle'?'archive_incomplete':'storage_unavailable','Ошибка комплекта '+op);let saved=0;c.page.on('download',()=>saved++);if(op==='listBundles')await c.button('Применить фильтры').click();else if(op==='getBundle')await c.page.locator('[data-bundle="1"]').click();else await c.button('Скачать ZIP комплекта').click();await c.text('Ошибка комплекта '+op);assert.equal(saved,0);assert.equal(await c.page.getByText('Ничего не найдено',{exact:true}).count(),0);await c.openCatalogFilters();assert.equal(await c.label('Показывать комплекты').inputValue(),'confirmed');delete c.state.faults[op];if(op==='listBundles'){await c.button('Применить фильтры').click();await c.visible(c.page.locator('[data-bundle="1"]'));}});
add('bundle-semantics','bundles.01 bundles.02 bundles.03','Bundle confirmed/all/domain/milestone semantics, >one page and hidden service IDs',async c=>{await c.nav('Результаты');await c.button('Комплекты').click();await c.visible(c.page.locator('[data-bundle="1"]'));assert.equal(await c.page.locator('[data-bundle]').count(),1);await c.openCatalogFilters();await c.label('Показывать комплекты').selectOption('all');await c.button('Применить фильтры').click();await until(async()=>assert.equal(await c.page.locator('[data-bundle]').count(),50));await c.button('Загрузить ещё комплекты').click();await until(async()=>assert.equal(await c.page.locator('[data-bundle]').count(),65));await c.label('Домены фильтра').fill('one.example');await c.label('Домены фильтра').press('Enter');await c.button('Применить фильтры').click();await until(async()=>assert.equal(await c.page.locator('[data-bundle]').count(),1));await c.label('Веха результатов').selectOption('0');await c.button('Применить фильтры').click();await c.text('Ничего не найдено');assert.equal(c.state.milestone,3);assert.equal(c.call('listBundles').at(-1).query.offset,'0');},{prepare:s=>{const b=s.bundles[1];s.bundles=[s.bundles[0],...Array.from({length:64},(_,i)=>({...b,id:i+2,name:'Готовый комплект '+(i+2)}))];}});
add('bundle-unconfirmed','bundles.04 bundles.05','Null sources/references and zero confirmations are explicit, false archive disables only download',async c=>{await c.nav('Результаты');await c.button('Комплекты').click();await c.openCatalogFilters();await c.label('Показывать комплекты').selectOption('all');await c.button('Применить фильтры').click();await c.page.locator('[data-bundle="2"]').click();await c.text('Подтверждений нет');await c.text('Источники неизвестны');assert(await c.button('Скачать ZIP комплекта').isDisabled());assert.equal(c.call('downloadBundle').length,0);await c.page.locator('[data-bundle="1"]').click();await c.text('Автор');await c.text('Название не сохранено');await c.text('https://example.org/source');assert.equal(await c.page.getByText('null',{exact:true}).count(),0);});
add('bundle-any-all-milestone','bundles.02 bundles.03 bundles.04','Two-domain any/all produce different exact bundle IDs; confirmed/all and detail preserve selected milestone',async c=>{await c.nav('Результаты');await c.button('Комплекты').click();const ids=()=>c.page.locator('[data-bundle]').evaluateAll(es=>es.map(e=>Number(e.dataset.bundle)));await until(async()=>assert.deepEqual(await ids(),[1,2,3]));await c.openCatalogFilters();await c.label('Показывать комплекты').selectOption('all');await c.button('Применить фильтры').click();await until(async()=>assert.deepEqual(await ids(),[1,2,3,4]));await c.label('Домены фильтра').fill('one.example two.example');await c.label('Домены фильтра').press('Enter');await c.button('Применить фильтры').click();await until(async()=>assert.deepEqual(await ids(),[1,2,3]));await c.openCatalogFilters();await c.label('Совпадение доменов').selectOption('all');await c.button('Применить фильтры').click();await until(async()=>assert.deepEqual(await ids(),[3]));await c.label('Веха результатов').selectOption('0');await c.button('Применить фильтры').click();await until(async()=>assert.deepEqual(await ids(),[1]));await c.page.locator('[data-bundle="1"]').click();await c.visible(c.button('Скачать ZIP комплекта'));const detail=c.page.locator('[aria-label="Подробности результата"]');assert((await detail.innerText()).includes('one.example'));assert((await detail.innerText()).includes('two.example'));assert.match(await detail.innerText(),/веха №0/);assert.equal(c.call('getBundle').at(-1).query.milestone_id,'0');assert.equal(c.state.milestone,3);},{prepare:s=>{const b=s.bundles[0];s.bundles=[{...b,id:1,results:[{id:1,domain:'one.example'}]},{...b,id:2,results:[{id:2,domain:'two.example'}]},{...b,id:3,results:[{id:3,domain:'one.example'},{id:4,domain:'two.example'}]},{...b,id:4,results:[]}];s.bundlesByMilestone={0:{1:[{id:11,domain:'one.example'},{id:12,domain:'two.example'}],2:[],3:[{id:13,domain:'one.example'}],4:[]}};}});

add('catalog-apply-draft', 'results.01 results.02',
  'Clicking Apply with a typed domain commits it and sends one matching catalog request',
  async c => {
    await catalog(c);
    const domain = c.label('Домены фильтра');
    await domain.fill('youtube.com');
    const before = c.call('listStrategies').length;
    await c.button('Применить фильтры').click();
    await until(() => assert.equal(c.call('listStrategies').length, before + 1));
    assert.deepEqual(c.call('listStrategies').at(-1).queryEntries.filter(([name]) => name === 'domains'),
      [['domains', 'youtube.com']]);
    await c.button('Убрать домен youtube.com').waitFor({state:'visible'});
    await until(async () => assert.deepEqual(await c.page.locator('[data-strategy]').evaluateAll(
      rows => rows.map(row => row.dataset.strategy)), ['g-c', 'g-a']));
  }, {prepare});

add('catalog-pagination-applied-filters', 'results.03 results.05 results.07 results.08 catalog.page-identity',
  'Unapplied filters neither regroup displayed rows nor mix a different server query into the next page',
  async c => {
    await catalog(c);
    const requests = () => c.call('listStrategies');
    const ids = () => c.page.locator('[data-strategy]').evaluateAll(
      rows => rows.map(row => row.dataset.strategy));
    const expected = Array.from({length:80}, (_, index) =>
      'page-' + String(index).padStart(3, '0'));
    const firstPage = requests().at(-1).query;
    await c.openCatalogFilters();await c.label('Порядок').selectOption('id');
    await c.openCatalogFilters();await c.label('Тип стратегии').selectOption('multisplit');
    await c.check('results.05', 'Unapplied sorting does not regroup current DOM', async () => {
      assert.equal(await c.page.locator('details').filter({has:c.page.locator('[data-strategy]')}).count(),2);
    });
    const before = requests().length;
    await c.button('Загрузить ещё стратегии').click();
    await until(() => assert.equal(requests().length,before+1));
    await c.check('results.07', 'Next request preserves filters that produced the first page', async () => {
      assert.deepEqual(requests().at(-1).query,{...firstPage,offset:'50'});
    });
    await c.check('catalog.page-identity', 'All 80 IDs remain in server order without mixing filters', async () => {
      await until(async()=>assert.deepEqual(await ids(),expected));
    });
    await c.label('Веха результатов').selectOption('0');
    await c.page.locator('[data-strategy="page-001"]').click();
    await until(()=>assert(c.call('getStrategy').length));
    await c.check('results.03 results.08', 'Detail and current list continue to use the applied milestone', async () => {
      assert.equal(c.call('getStrategy').at(-1).query.milestone_id,'3');
      assert.match(await c.page.locator('.catalog-list-heading').innerText(),/веха №3/);
    });
    await c.label('Веха результатов').selectOption('3');
    await c.button('Применить фильтры').click();
    await until(()=>assert.equal(requests().at(-1).query.family,'multisplit'));
    assert.equal(requests().at(-1).query.sort,'id');
    assert.equal(requests().at(-1).query.offset,'0');
    await until(async()=>assert.deepEqual(await ids(),expected.slice(45)));
  }, {prepare(state) {
    const base = state.strategies[0];
    state.strategies = Array.from({length:80}, (_, index) => ({
      ...base, id:'page-'+String(index).padStart(3,'0'), protocol:'tls',
      family:index<45?'fake':'multisplit', family_rank:index<45?0:1,
    }));
  }});
