import {createRegistry, exportBackup, prepareRestore, applyRestore, MAX_BYTES} from './core.mjs';

export function mountBackup(schema, refresh) {
  const registry = createRegistry(schema);
  const $ = id => document.getElementById(id);
  let plan = null, backedUp = false, selection = 0;
  const notice = message => { $('backup-notice').textContent = message; };
  function reset() {
    selection++;
    plan = null; backedUp = false;
    $('backup-preview').hidden = true;
    $('backup-restore').disabled = true;
  }
  function ready() {
    const changes = plan?.rows.filter(r => r.action !== 'unchanged').length || 0;
    $('backup-restore').disabled = !changes || ($('backup-save-first').checked && !backedUp);
  }
  function download() {
    const result = exportBackup(localStorage, registry);
    const url = URL.createObjectURL(new Blob([result.text], {type:'application/json;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cpp-roadmap-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    backedUp = true; ready();
    notice(`Подготовлена копия: ${result.archive.entries.length} разделов. Проверь, что JSON сохранился в загрузках.` + (result.warnings.length ? ' В копии есть повреждённые разделы; они сохранены без изменений для ручного восстановления: ' + result.warnings.join('; ') : ''));
  }
  for (const id of ['backup-export', 'backup-before']) $(id).addEventListener('click', () => {
    try { download(); } catch (err) { notice('Экспорт не выполнен: ' + err.message); }
  });
  $('backup-file').addEventListener('change', async event => {
    reset();
    const request = selection;
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > MAX_BYTES) throw Error('Файл превышает 32 МиБ.');
      const text = await file.text();
      if (request !== selection) return;
      plan = prepareRestore(text, localStorage, registry);
      const list = $('backup-rows'); list.replaceChildren();
      const labels = {add:'Будет добавлен', replace:'Будет заменён целиком', unchanged:'Без изменений'};
      for (const row of plan.rows) {
        const li = document.createElement('li');
        li.textContent = row.label + ' — ' + labels[row.action];
        list.append(li);
      }
      $('backup-summary').textContent = `${file.name}: ${plan.legacy ? 'Старый отдельный JSON распознан. ' : ''}Проверено разделов: ${plan.rows.length}. Отсутствуют в файле: ${plan.omitted} — они останутся без изменений.`;
      $('backup-preview').hidden = false;
      $('backup-save-first').checked = true;
      ready();
      notice(plan.rows.length ? 'Данные проверены. Прогресс ещё не изменён. Закрой другие вкладки карт перед восстановлением.' : 'Файл пуст: восстанавливать нечего.');
    } catch (err) { if (request === selection) { reset(); notice('Импорт отклонён: ' + err.message); } }
    finally { if (request === selection) event.target.value = ''; }
  });
  $('backup-save-first').addEventListener('change', ready);
  $('backup-cancel').addEventListener('click', () => { reset(); notice('Восстановление отменено. Прогресс не изменён.'); });
  $('backup-restore').addEventListener('click', () => {
    if (!plan || ($('backup-save-first').checked && !backedUp)) return;
    const replace = plan.rows.filter(r => r.action === 'replace').length;
    const add = plan.rows.filter(r => r.action === 'add').length;
    if (!window.confirm(`Восстановить выбранный файл? Будет заменено разделов: ${replace}, добавлено: ${add}. Замена целиком удалит записи внутри заменяемых разделов, которых нет в файле. Убедись, что прежняя копия сохранена, а другие вкладки карт закрыты.`)) return;
    try {
      const count = applyRestore(plan, {confirmed:true});
      reset(); refresh();
      notice(`Восстановлено разделов: ${count}. Открой карты заново. Отметки перенесены из файла; выполнение заданий не оценивалось.`);
    } catch (err) { reset(); notice('Восстановление не завершено: ' + err.message); }
  });
  window.addEventListener('storage', event => {
    if (plan && (event.key === null || registry.has(event.key))) {
      reset(); notice('Прогресс изменён в другой вкладке. Проверь файл заново.');
    }
  });
}
