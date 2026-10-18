"""Enrich the supplied deck using the same explanations as the roadmap.

Usage: python build-anki.py --source C_C++.apkg --output C_CPP_Interview_Explained.apkg
Dependency: anki==26.9.3 (official Anki Python backend; GUI is not required).
The original four fields, GUIDs, card template count, and subdecks are retained.
The old `link` answer field receives the full explanation including its old URL.
"""
import argparse
import html
import json
import re
import tempfile
from pathlib import Path

from anki.collection import Collection, DeckIdLimit
from anki import import_export_pb2 as pb

BASE = Path(__file__).resolve().parents[1]


def inline(value):
    parts = re.split(r'(`[^`\n]+`|\*\*[^*\n]+\*\*)', value)
    return ''.join('<code>'+html.escape(p[1:-1])+'</code>' if p.startswith('`') and p.endswith('`') else '<strong>'+html.escape(p[2:-2])+'</strong>' if p.startswith('**') and p.endswith('**') else html.escape(p) for p in parts)


def paragraphs(value):
    return ''.join('<p>'+inline(p).replace('\n', '<br>')+'</p>' for p in re.split(r'\n\n+', value) if p)


def items(values):
    return '<ul>'+''.join('<li>'+inline(v)+'</li>' for v in values)+'</ul>'


def link(url, title):
    if not isinstance(url, str) or not url.startswith('https://'):
        raise ValueError('Expected an HTTPS resource URL')
    return '<a href="'+html.escape(url, quote=True)+'">'+html.escape(title)+'</a>'


def block(title, body, opened=False):
    return '<details'+(' open' if opened else '')+'><summary>'+html.escape(title)+'</summary><div class="explanation-body">'+body+'</div></details>'


def answer_html(card, variant):
    parts = ['<main class="interview-answer">', '<div class="meta">Вопрос '+str(variant['number'])+' · '+html.escape(card['id'])+' · '+html.escape(' / '.join(card['standards']))+'</div>']
    if card.get('clarification'):
        parts.append('<aside><b>Уточнение формулировки</b>'+paragraphs(card['clarification'])+'</aside>')
    parts.append('<section class="short"><h2>Ответ на вопрос</h2>'+paragraphs(variant['answer'])+'</section>')
    parts.append(block('Краткий ответ по всей теме', paragraphs(card['shortAnswer'])))
    detail = ''.join('<h3>'+html.escape(s['title'])+'</h3>'+''.join(paragraphs(p) for p in s['paragraphs']) for s in card['explanation'])
    parts.append(block('Подробное объяснение', detail))
    e = card['example']
    labels = {'run':'самостоятельная программа','compile':'проверка компиляции','illustrative':'иллюстрация: см. ограничения','text':'пример ответа или сценария'}
    example = '<h3>'+html.escape(e['title'])+'</h3><p class="meta">'+html.escape(e['language']+' · '+labels[e['kind']])+'</p><pre><code>'+html.escape(e['code'])+'</code></pre><h3>Результат и ограничения</h3>'+paragraphs(e['expected'])+items(e['explanation'])
    parts.append(block('Пример и его разбор', example))
    follow = ''.join(block(q['question'], paragraphs(q['answer'])) for q in card['followUps'])
    parts.append(block('Дополнительные вопросы собеседования', follow))
    parts.append(block('Частые ошибки', items(card['pitfalls'])))
    p = card['practice']
    practice = paragraphs(p['task'])+'<h3>Критерии проверки</h3>'+items(p['criteria'])+block('Показать решение', paragraphs(p['solution']))
    parts.append(block('Самостоятельная практика', practice))
    sources = ''.join('<p>'+link(r['url'], r['title'])+'<br><small>'+html.escape(r['focus'])+'</small></p>' for r in card['resources'])
    if variant.get('sourceUrl'):
        sources += '<p>'+link(variant['sourceUrl'], 'Ссылка из исходной колоды')+'</p>'
    parts.append(block('Источники', sources))
    url = 'https://nspace0.github.io/cpp_roadmap/#view=interview&question='+card['id']
    parts.append('<p class="roadmap">'+link(url, 'Открыть этот разбор в роадмапе')+'</p>')
    parts.append('<p class="note">Оценка Anki относится к воспроизведению ответа на этот вопрос. Полный разбор и практика помогают проверить понимание; расписание Anki и отметки сайта не синхронизируются.</p></main>')
    return ''.join(parts)


CSS = '''
.card{font-family:Arial,system-ui,sans-serif;font-size:18px;line-height:1.7;text-align:left;color:#263c51;background:#f5f8fb;margin:0;padding:18px;word-wrap:break-word}
.question-wrap,.interview-answer{max-width:850px;margin:0 auto}.question{font-size:25px;line-height:1.45;font-weight:700;color:#234863;margin:18px 0}.source-mark{font-size:11px;color:#7c8d9e}.meta{font-size:12px;color:#70889d;line-height:1.6;margin:10px 0}.short{background:#eaf3f9;border:1px solid #c8dceb;border-radius:9px;padding:16px 20px;margin:17px 0}h2{font-size:20px;margin:0 0 12px}h3{font-size:18px;margin:20px 0 10px}p{margin:12px 0}details{background:#fff;border:1px solid #d2dfeb;border-radius:8px;margin:12px 0;overflow:hidden}summary{cursor:pointer;background:#edf3f8;font-size:16px;font-weight:650;padding:13px 15px;line-height:1.5}.explanation-body{padding:5px 17px 14px}details details summary{font-size:15px;background:#f7f9fc}ul{padding-left:24px}li{margin:9px 0}aside{background:#fff8e4;border:1px solid #e9d8a6;border-radius:8px;padding:14px 18px;margin:15px 0}aside>b{font-size:13px;color:#8d6a32}pre{background:#172c3d;color:#e4edf5;padding:16px;border-radius:7px;overflow-x:auto;font-size:13px;line-height:1.7;tab-size:4;white-space:pre}code{font-family:Consolas,monospace}p code,li code{font-size:.9em;background:#e9eff4;padding:1px 4px;border-radius:3px}a{color:#28678f;text-decoration:underline;overflow-wrap:anywhere}.roadmap{font-weight:600;font-size:14px}.note{font-size:12px;color:#7a8c9b;border-top:1px solid #d7e2ec;padding-top:16px}hr{border:0;border-top:1px solid #cedce8;margin:23px auto;max-width:850px}
.nightMode.card,.night_mode .card{color:#d8e5ef;background:#19232e}.nightMode .question,.nightMode h2,.nightMode h3,.night_mode .question{color:#e4edf5}.nightMode details,.night_mode details{background:#202d3a;border-color:#435466}.nightMode summary,.night_mode summary{background:#2b3c4d}.nightMode details details summary,.night_mode details details summary{background:#293747}.nightMode .short,.night_mode .short{background:#223b4d;border-color:#44647a}.nightMode aside,.night_mode aside{background:#3f3726;border-color:#6c5d39}.nightMode aside>b{color:#e2c785}.nightMode p code,.nightMode li code{background:#344555}.nightMode a{color:#9bcdf0}.nightMode .source-mark,.nightMode .meta,.nightMode .note{color:#a1b4c5}
@media(max-width:600px){.card{padding:12px;font-size:17px}.question{font-size:22px}summary{font-size:15px;padding:12px}.explanation-body{padding:4px 13px 12px}.short{padding:14px}pre{font-size:12px;padding:12px}}
'''


def build(source, content, output):
    data = json.loads(content.read_text())
    variants = {v['number']:(c,v) for c in data['cards'] for v in c['variants']}
    assert len(variants) == data['source']['questionCount'] == 349
    assert set(variants) == set(range(1,350))
    with tempfile.TemporaryDirectory(prefix='cpp-interview-anki-') as tmp:
        col = Collection(str(Path(tmp)/'collection.anki2'))
        try:
            col.import_anki_package(pb.ImportAnkiPackageRequest(package_path=str(source.resolve()), options=pb.ImportAnkiPackageOptions(with_scheduling=False)))
            ids = sorted(col.find_notes(''))
            assert len(ids) == col.card_count() == 349
            notes=[]
            for number,nid in enumerate(ids,1):
                note = col.get_note(nid)
                assert list(note.keys()) == ['question','percent','link','tag']
                card,variant=variants[number]
                plain=html.unescape(re.sub('<[^>]+>', ' ', note['question'])).strip()
                assert plain == variant['question'], (number,plain,variant['question'])
                note['link']=answer_html(card,variant)
                note.tags=sorted(set(note.tags+[f'interview::{card["category"]}',f'study::{card["id"]}']))
                notes.append(note)
            col.update_notes(notes)
            for model in col.models.all():
                if model['name'] != 'Dev.Question/Answer':
                    continue
                assert len(model['tmpls']) == 1
                model['css']=CSS
                model['tmpls'][0]['qfmt']='<div class="question-wrap"><div class="source-mark">Метка исходной колоды: {{percent}}% · не оценка твоих знаний</div><div class="question">{{question}}</div></div>'
                model['tmpls'][0]['afmt']='{{FrontSide}}<hr id="answer">{{link}}'
                col.models.update_dict(model)
            for deck in col.decks.all():
                if deck['name'] == 'C/C++':
                    deck['desc']='349 исходных вопросов; ответы, объяснения, примеры и практика. Разборы совпадают с банком собеседования в C++ Roadmap. Исходные проценты не являются оценкой знаний. Подколоды и идентификаторы заметок сохранены. Учебное расписание автора не включено.'
                    col.decks.update_dict(deck)
            output.parent.mkdir(parents=True,exist_ok=True)
            deck_id=col.decks.id('C/C++',create=False)
            assert deck_id is not None
            count=col.export_anki_package(out_path=str(output.resolve()),options=pb.ExportAnkiPackageOptions(with_scheduling=False,with_deck_configs=False,with_media=False,legacy=True),limit=DeckIdLimit(deck_id))
            print(json.dumps({'path':str(output.resolve()),'exportedCards':count,'notes':len(ids),'bytes':output.stat().st_size},ensure_ascii=False))
        finally:
            col.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',required=True,type=Path)
    parser.add_argument('--content',type=Path,default=BASE/'data/interviews.json')
    parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args()
    build(args.source,args.content,args.output)
