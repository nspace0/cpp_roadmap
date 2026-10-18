"""Verify an enriched .apkg with the official Anki backend, including updates.

Usage: python check-anki.py --source ORIGINAL.apkg --enriched EXPLAINED.apkg
Requires the same official anki version as build-anki.py.
"""
import argparse
import html
import json
import re
import tempfile
import zipfile
from pathlib import Path

from anki.collection import Collection
from anki import import_export_pb2 as pb


def import_deck(col, path):
    return col.import_anki_package(pb.ImportAnkiPackageRequest(
        package_path=str(path.resolve()),
        options=pb.ImportAnkiPackageOptions(with_scheduling=False)))


def check(source, enriched):
    with zipfile.ZipFile(enriched) as archive:
        assert archive.testzip() is None
    with tempfile.TemporaryDirectory(prefix='cpp-anki-check-') as folder:
        fresh = Collection(str(Path(folder)/'fresh.anki2'))
        existing = Collection(str(Path(folder)/'existing.anki2'))
        try:
            import_deck(fresh, enriched)
            import_deck(existing, source)
            assert fresh.note_count() == fresh.card_count() == 349
            source_by_guid = {existing.get_note(n).guid: existing.get_note(n) for n in existing.find_notes('')}
            new_by_guid = {fresh.get_note(n).guid: fresh.get_note(n) for n in fresh.find_notes('')}
            assert source_by_guid.keys() == new_by_guid.keys()
            for guid, original in source_by_guid.items():
                new = new_by_guid[guid]
                assert list(new.keys()) == list(original.keys()) == ['question','percent','link','tag']
                for field in ['question','percent','tag']:
                    assert original[field] == new[field], (guid,field)
                original_urls = re.findall(r'href=[\"\']([^\"\']+)', original['link'])
                assert original_urls and all(html.escape(html.unescape(url), quote=True) in new['link'] for url in original_urls)
                assert 'Подробное объяснение' in new['link']
                assert 'Самостоятельная практика' in new['link']
            decks = {d['name']: len(fresh.find_cards('deck:"'+d['name']+'"')) for d in fresh.decks.all() if d['name'].startswith('C/C++::')}
            assert decks == {'C/C++::1-100':100,'C/C++::101-200':100,'C/C++::201-300':100,'C/C++::301-349':49}, decks
            for cid in fresh.find_cards(''):
                card = fresh.get_card(cid)
                assert card.question().strip()
                answer = card.answer()
                assert 'Ответ на вопрос' in answer and '<pre><code>' in answer
                assert 'Первоисточники' in answer or 'Источники' in answer
                assert '<script' not in answer.lower()
                assert card.reps == 0 and card.lapses == 0
            # A studied card must retain its scheduling when the content is updated.
            cid = sorted(existing.find_cards(''))[0]
            card = existing.get_card(cid)
            card.type = 2
            card.queue = 2
            card.reps = 17
            card.lapses = 2
            card.ivl = 31
            card.factor = 2350
            card.due = 95
            existing.update_card(card)
            schedule_fields = ['type','queue','reps','lapses','ivl','factor','due']
            schedule_before = {k:getattr(existing.get_card(cid),k) for k in schedule_fields}
            import_deck(existing, enriched)
            assert existing.note_count() == existing.card_count() == 349
            assert schedule_before == {k:getattr(existing.get_card(cid),k) for k in schedule_fields}
            for nid in existing.find_notes(''):
                assert 'Подробное объяснение' in existing.get_note(nid)['link']
            assert existing.get_card(cid).question() == fresh.get_card(sorted(fresh.find_cards(''))[0]).question()
            return {'notes':349,'cards':349,'renderedAnswers':349,'subdecks':decks,'originalQuestionFieldsPreserved':True,'sameGuids':True,'existingImportDuplicates':0,'reviewSchedulePreserved':True,'zipIntegrity':'passed'}
        finally:
            fresh.close()
            existing.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source',required=True,type=Path)
    parser.add_argument('--enriched',required=True,type=Path)
    args = parser.parse_args()
    print(json.dumps(check(args.source,args.enriched),ensure_ascii=False,indent=2))
