#!/usr/bin/env python3
"""Live Linux GDB checks. Run from the ZIP or pass --labs to an extracted root.
No progress files, system ptrace settings or existing user processes are modified.
"""
import argparse
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--labs', type=Path, default=Path(__file__).resolve().parent)
parser.add_argument('--output', type=Path, default=Path('gdb-verification'))
args = parser.parse_args()
args.output = args.output.resolve()
args.output.mkdir(parents=True, exist_ok=True)
report = {'startedAt': datetime.now(timezone.utc).isoformat(), 'platform': platform.platform(),
          'machine': platform.machine(), 'checks': [], 'limitations': [
              'No user completion status is written.', 'No interactive TUI visual inspection.',
              'No external SSH host, rr, systemd crash collector or user WSL/Kubuntu installation.',
              'No Windows/MSVC/MASM/WinDbg or Intel i5-12400F-specific validation.']}

def save():
    (args.output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

def command(cmd, cwd, timeout=40):
    return subprocess.run(cmd, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)

for tool in ('gdb', 'g++', 'gcc', 'gdbserver'):
    if not shutil.which(tool):
        report['status'] = 'blocked'
        report['reason'] = 'Required executable missing: ' + tool
        save()
        sys.exit(report['reason'])
    report[tool] = command([tool, '--version'], args.output).stdout.splitlines()[0]
if sys.platform != 'linux' or platform.machine() not in ('x86_64', 'amd64'):
    report['status'] = 'blocked'
    report['reason'] = 'These checks require Linux x86-64.'
    save()
    sys.exit(report['reason'])

with tempfile.TemporaryDirectory(prefix='roadmap-gdb-') as temporary:
    work = Path(temporary)
    shutil.copytree(args.labs / 'gdb', work / 'src')
    src = work / 'src'
    for name in ('gdb-lab', 'mutex-lab', 'range-sum', 'fork-lab', 'reverse-lab'):
        compiler, suffix, flags = ('gcc', '.c', []) if name == 'reverse-lab' else ('g++', '.cpp', ['-std=c++20', '-pthread'])
        result = command([compiler, '-g', '-O0', '-fno-omit-frame-pointer', *flags, str(src / (name + suffix)), '-o', name], work)
        if result.returncode:
            report.update(status='failed', reason='Build failed: ' + name, compilerOutput=result.stdout)
            save()
            sys.exit(1)
    for opt in ('Og', 'O2'):
        result = command(['g++', '-std=c++20', '-g', '-' + opt, '-pthread', str(src / 'gdb-lab.cpp'), '-o', 'lab-' + opt], work)
        if result.returncode:
            report.update(status='failed', reason=result.stdout)
            save()
            sys.exit(1)

    base = ['gdb', '-nx', '-q', '-batch', '-iex', 'set auto-load off', '-ex', 'set debuginfod enabled off',
            '-ex', 'set pagination off', '-ex', 'set confirm off', '-ex', 'set disable-randomization off']
    prefix = '''python
import gdb

def check(condition, message):
    if not condition:
        raise gdb.GdbError("CHECK FAILED: " + message)

def number(expression):
    return int(gdb.parse_and_eval(expression))

def stack_names():
    frame, names = gdb.newest_frame(), []
    while frame:
        names.append(frame.name())
        frame = frame.older()
    return names
end
'''
    def run(name, lessons, body, program='gdb-lab', argv=('sum',), expected=0, contains=()):
        script = work / (name + '.gdb')
        script.write_text(prefix + body + '\n')
        try:
            result = command(base + ['-x', str(script), '--args', str(work / program), *argv], work)
            output, code = result.stdout, result.returncode
        except subprocess.TimeoutExpired as err:
            output = (err.stdout or b'').decode() if isinstance(err.stdout, bytes) else err.stdout or ''
            output += '\nTIMEOUT\n'
            code = -1
        (args.output / (name + '.log')).write_text(output)
        passed = code == expected and all(s in output for s in contains)
        row = {'name': name, 'lessons': lessons, 'status': 'passed' if passed else 'failed', 'returncode': code}
        report['checks'].append(row)
        print(json.dumps(row), flush=True)
        if not passed:
            print(output[-5000:], flush=True)
        save()
        return passed, output

    ok, output = run('preflight', ['CT04.1'], '''break step_value
run
python check(gdb.newest_frame().name() == 'step_value', 'live breakpoint reached')
''')
    if not ok:
        report['status'] = 'blocked' if 'ptrace' in output or 'Operation not permitted' in output else 'failed'
        report['reason'] = 'Live inferior could not reach step_value; this is NOT a passing verification.'
        save()
        sys.exit(2)

    run('stepping-stack', ['CT04.1', 'CT04.3'], '''break sum_values
run
python check(number('count') == 3, 'count')
next
next
step
python check(gdb.newest_frame().name() == 'step_value', 'step enters callee')
python check(stack_names()[:4] == ['step_value', 'sum_values', 'inspect_values', 'main'], 'call chain')
bt full
up
python check(gdb.selected_frame().name() == 'sum_values', 'up selects caller')
down
python check(gdb.selected_frame().name() == 'step_value', 'down selects callee')
next
python check(number('watched') == 3, 'next executed assignment')
finish
python check(gdb.newest_frame().name() == 'sum_values', 'finish returns')
disable breakpoints
continue
python check(number('$_exitcode') == 0, 'normal exit')
''', contains=('sum=16',))
    run('conditional-ignore', ['CT04.2'], '''break step_value if index == 2
run
python check(number('index') == 2 and number('value') == 8, 'conditional arguments')
info breakpoints
delete breakpoints
break step_value
ignore 2 2
run
python check(number('index') == 2 and number('value') == 8, 'ignore first two calls')
''')
    run('breakpoint-commands', ['CT04.2'], '''break step_value
commands
silent
printf "INPUT %d %d\\n", index, value
continue
end
run
python check(number('$_exitcode') == 0, 'exit after automatic continues')
''', contains=('INPUT 0 3', 'INPUT 1 5', 'INPUT 2 8'))
    run('memory-values', ['CT05.1', 'CT05.2'], '''break inspect_values
run
ptype values
whatis word
print values
print/x word
x/4xb &word
python check(number('word') == 0x12345678, 'hex value')
python check(bytes(gdb.selected_inferior().read_memory(number('&word'), 4)) == bytes([0x78,0x56,0x34,0x12]), 'little endian')
break sum_values
continue
x/3dw data
print *data@count
python check([number('data[%d]' % i) for i in range(3)] == [3,5,8], 'array memory')
break step_value
continue
display index
display value
continue
python check(number('index') == 1 and number('value') == 5, 'display at second call')
info display
''')
    run('watchpoint', ['CT05.3'], '''start
watch watched
continue
python check(number('watched') == 3, 'first write')
continue
python check(number('watched') == 6, 'second write')
continue
python check(number('watched') == 10, 'third write')
info watchpoints
''', contains=('Hardware watchpoint',))
    run('instructions-abi', ['CT06.1'], '''set disassembly-flavor intel
break *step_value
run
python check(number('$edi') == 3 and number('$esi') == 0, 'SysV arguments at function entry')
info registers rip rsp rdi rsi
disassemble /r step_value
x/8i $pc
python old_pc = number('$pc')
stepi
python check(number('$pc') != old_pc, 'stepi executes an instruction')
python old_pc = number('$pc')
nexti
python check(number('$pc') != old_pc, 'nexti executes an instruction')
''')
    for program in ('gdb-lab', 'lab-Og', 'lab-O2'):
        run('optimization-' + program, ['CT06.2'], '''break sum_values
run
info args
info locals
disassemble /s sum_values
bt
continue
python check(number('$_exitcode') == 0, 'optimized program exit')
''', program=program, contains=('sum=16',))
    run('throw-catch', ['CT06.3'], '''catch throw
run
bt
python check('checked_value' in stack_names(), 'throw caller')
continue
python check(number('$_exitcode') == 0, 'exception handled')
''', argv=('throw',), contains=('caught: index outside values',))
    run('abort-signal', ['CT06.3'], '''run
bt
python check(number('$_siginfo.si_signo') == 6, 'intentional SIGABRT')
python check('main' in stack_names(), 'abort source frame')
''', argv=('abort',), contains=('SIGABRT',))
    run('core-create', ['CT07.1'], '''break step_value
run
generate-core-file lab.core
''')
    run('core-read', ['CT07.1'], '''core-file lab.core
bt
info registers
python check(stack_names()[:4] == ['step_value', 'sum_values', 'inspect_values', 'main'], 'core call chain')
python check(number('value') == 3, 'core argument')
''')
    run('threads', ['CT07.2'], '''break snapshot_marker
run
info threads
thread apply all bt
python check(len(gdb.selected_inferior().threads()) == 3, 'main and two workers')
continue
python check(number('$_exitcode') == 0, 'bounded wait terminates')
''', program='mutex-lab', argv=(), contains=('worker', 'timeouts='))
    run('fork-exec', ['CT07.3'], '''set follow-fork-mode child
set detach-on-fork on
catch fork
catch exec
run
continue
info inferiors
continue
python check(number('$_exitcode') == 0, 'child exited normally')
''', program='fork-lab', argv=(), contains=('forked process', 'exec'))
    run('attach-detach', ['CT07.3'], '''python
import subprocess
child = subprocess.Popen(["./gdb-lab", "wait"])
try:
    gdb.execute('attach %d' % child.pid)
    check(gdb.selected_inferior().pid == child.pid, 'attached to own child')
    gdb.execute('bt')
    gdb.execute('detach')
    check(child.wait(timeout=20) == 0, 'child continues after detach')
finally:
    if child.poll() is None:
        child.terminate()
        child.wait(timeout=5)
end
''', argv=())
    # Source the exact shipped script, including its exit status and logging.
    run('batch-original', ['CT08.1'], 'source src/check-inputs.gdb', contains=('index=2 value=8',))
    negative = (src / 'check-inputs.gdb').read_text().replace('value != 8', 'value != 7')
    (src / 'negative.gdb').write_text(negative)
    run('batch-negative', ['CT08.1'], 'source src/negative.gdb', expected=1, contains=('Unexpected input',))
    if (work / 'gdb-inputs.log').exists():
        shutil.copyfile(work / 'gdb-inputs.log', args.output / 'batch-session.log')
    run('python-command', ['CT08.2'], '''source src/show-inputs.py
break step_value
run
python before = (number('watched'), number('$pc'))
show-inputs
python check((number('watched'), number('$pc')) == before, 'read-only command')
frame 3
python
try:
    gdb.execute('show-inputs')
except gdb.error as exc:
    check('Select the step_value frame' in str(exc), 'wrong-frame diagnostic')
else:
    raise gdb.GdbError('wrong frame unexpectedly accepted')
end
''', contains=('index=0 value=3',))
    run('gdbserver-stdio', ['CT08.3'], '''target remote | gdbserver --once - ./gdb-lab sum
break step_value
continue
info args
python check(number('value') == 3 and number('index') == 0, 'remote live args')
disable breakpoints
continue
''', contains=('sum=16',))
    run('reverse', ['CT09.2'], '''start
record full
next
python first = number('value'); check(first == 1, 'first assignment')
next
python check(number('value') == 3, 'second assignment')
reverse-next
python check(number('value') == first, 'reverse restores previous value')
info record
record stop
''', program='reverse-lab', argv=())
    run('intentional-range-bug', ['CT09.3'], '''break range_sum
run
next
next
info locals
finish
continue
python check(number('$_exitcode') == 1, 'bug returns nonzero')
''', program='range-sum', argv=(), contains=('actual=8 expected=16',))
    # Correction and regression are compiled in the temporary directory only.
    # The exercise in the archive intentionally remains broken for the student.
    original = (src / 'range-sum.cpp').read_text()
    harness = '''
int main() {
    const std::vector<std::vector<int>> inputs{{}, {8}, {3,5,8}, {-3,5,-8}};
    const long expected[]{0,8,16,-6};
    for (std::size_t i=0; i<4; ++i) if (range_sum(inputs[i]) != expected[i]) return 1;
    return 0;
}
'''
    regression = original[:original.index('int main()')] + harness
    for label, code, expected in [('original', regression, 1), ('corrected', regression.replace('i + 1 < values.size()', 'i < values.size()'), 0)]:
        target = work / ('regression-' + label + '.cpp')
        target.write_text(code)
        built = command(['g++', '-std=c++20', '-g', '-O0', str(target), '-o', 'regression-' + label], work)
        result = command(['./regression-' + label], work) if built.returncode == 0 else built
        report['checks'].append({'name':'regression-' + label, 'lessons':['CT09.3'], 'status':'passed' if result.returncode == expected else 'failed', 'returncode':result.returncode})

report['status'] = 'passed' if all(x['status'] == 'passed' for x in report['checks']) else 'failed'
report['finishedAt'] = datetime.now(timezone.utc).isoformat()
save()
print(json.dumps(report, ensure_ascii=False, indent=2))
sys.exit(0 if report['status'] == 'passed' else 1)
