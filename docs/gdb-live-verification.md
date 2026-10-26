# Живая проверка GDB и запуск на WSL/Kubuntu

Дата: 26 октября 2026, Москва. Исходный учебный набор: коммит `18d4b194b25a106c0a33e542e2a5f547ad0838ba`.

Локальная среда подготовки запрещает `ptrace` (`Operation not permitted`); этот отказ не засчитан как успешный запуск. Настоящие процессы проверяются на GitHub Actions, Ubuntu 24.04.5 x86-64, Linux 6.17.0-1022-azure, GCC 13.3, GDB/gdbserver 15.1. Это отдельный Linux-стенд, а не компьютер пользователя и не подтверждение прохождения им уроков.

Первый [живой прогон](https://github.com/nspace0/cpp_roadmap/actions/runs/40246264530) выполнил 25 проверок: 24 успешны; CT08.2 обнаружил необработанный `ValueError` в `frame.read_var()` при выборе неверного кадра. В `show-inputs.py` исправлен перехват `(gdb.error, ValueError)`. Повторная проверка использует тот же негативный сценарий, без ослабления ожидаемого результата. Повторный [прогон 40296124602](https://github.com/nspace0/cpp_roadmap/actions/runs/40296124602) успешен: **25 из 25 проверок**. Проверен код `c1bccb17`, собранные страницы и архив сохранены коммитом `4f4b940`. Журналы доступны в артефакте `review-verification` (30 дней); JSON-итог сохранён в `docs/verification/gdb-2026-10-26.json`.

## Покрытие уроков

| Уроки | Фактически запускаемый опыт |
|---|---|
| CT04.1–CT04.3 | break/run/continue, условие index=2, ignore, команды точки; next/step/finish; стек step_value → sum_values → inspect_values → main, up/down |
| CT05.1–CT05.2 | тип, print/display, массив 3/5/8, чтение памяти; байты word = 78 56 34 12 |
| CT05.3 | аппаратный watchpoint, изменения watched = 3 → 6 → 10 |
| CT06.1 | stepi/nexti и изменение PC; Linux SysV EDI=3, ESI=0; дизассемблер |
| CT06.2 | сборки O0/Og/O2, символы/локальные значения, сумма 16; optimized out не требуется искусственно |
| CT06.3 | catch throw, перехваченное out_of_range; намеренный SIGABRT и стек |
| CT07.1 | generate-core-file и чтение тем же бинарником; сохранённый стек и аргументы |
| CT07.2 | три потока, thread apply all bt, ограниченное ожидание и нормальный выход |
| CT07.3 | fork/exec с follow child; attach/detach к дочернему процессу самого GDB |
| CT08.1 | исходный batch, лог и exit=0; неверное ожидаемое value даёт exit=1 |
| CT08.2 | Python-команда читает аргументы без изменения watched/PC; неверный кадр даёт понятную ошибку |
| CT08.3 | настоящий gdbserver через локальный stdio; это не внешний SSH-хост |
| CT09.2 | record full и reverse-next восстанавливают предыдущее значение |
| CT09.3 | исходная ошибка 8 вместо 16; временная исправленная копия; регрессии [], [8], [3,5,8], [-3,5,-8] |

В исходном архиве `range-sum.cpp` намеренно остаётся ошибочным. Исправление и проверочный harness создаются только во временном каталоге. Скрипт не меняет исходники упражнений, системные политики ptrace и прогресс сайта.

Исправления описаний: CT04.1 — два `next` до `step` в приложенной GCC O0-сборке; CT08.1 — shell `printf ... "$?"` больше не назван командой GDB; CT05.3 — показаны все три записи и объяснено, почему `rwatch` не обязан срабатывать в программе, которая только записывает `watched`. Первый запуск в README архива использует O0 для согласования с примерами адресуемой памяти. `labs.zip` теперь содержит 25 файлов: прежние 24 и `verify-live.py`.

## WSL Ubuntu 24.04 и Kubuntu

В WSL выполняй команды **в Bash Ubuntu**, а не в PowerShell. В Kubuntu — в терминале своей системы. Нужны Linux x86-64 и Python 3. Одна и та же последовательность:

```sh
sudo apt update
sudo apt install build-essential gdb gdbserver cmake ninja-build nasm git python3
mkdir -p ~/projects
cd ~/projects
git clone https://github.com/nspace0/cpp_roadmap.git
cd cpp_roadmap
# До слияния изменений используй ветку проверки:
git switch fix/gdb-live-and-progress-backup
python3 -m zipfile -e cpp-tools/labs.zip ./lab-work
cd lab-work/cpp-devtools-labs
python3 verify-live.py --output gdb-verification
printf 'verification status=%s\n' "$?"
```

Если репозиторий уже есть, используй его рабочую копию и `git fetch origin`, затем переключи ветку, предварительно сохранив собственные изменения. После слияния достаточно актуальной `main`. Для каждого повторного распаковывания выбирай новый каталог, чтобы не перезаписать свою решённую лабораторию.

Результат — `gdb-verification/report.json` и журнал каждой проверки. Код 0 означает, что все программные проверки прошли. Ошибка запуска или отсутствие инструмента возвращает ненулевой код; `blocked` не является PASS. Негативный GDB batch намеренно возвращает 1 внутри теста и считается успешным только при ожидаемой диагностике.

Ручная первая сессия из `gdb/`:

```sh
g++ -std=c++20 -g -O0 -fno-omit-frame-pointer -pthread gdb-lab.cpp -o gdb-lab
gdb -nx -q --args ./gdb-lab sum
```

Команды **в GDB**:

```text
break sum_values
run
info args
next
next
step
bt
print value
next
print watched
finish
continue
quit
```

Ожидания: `step` входит в `step_value`; в первом вызове `value=3`, `index=0`; после присваивания `watched=3`; в конце сумма 16. Не привязывай проверку к абсолютным адресам. Если строка остановки отличается, сверь `list` и фактическую таблицу строк своего компилятора.

Отдельная CMake-сборка:

```sh
cmake -S gdb -B build-gdb -G Ninja -DCMAKE_BUILD_TYPE=Debug
cmake --build build-gdb
```

Для WSL храни исходники и build в `~/projects`. Windows/MSVC и Linux/GCC требуют разных build-каталогов. Параметры `ptrace_scope`, глобальный `auto-load safe-path` и настройки безопасности ради прохождения теста не меняй. При отказе attach сначала попробуй запуск через `gdb --args`; это другой сценарий разрешений. Наш attach-тест делает GDB родителем процесса и не подтверждает произвольное подключение к соседнему PID.

## Что остаётся для локального стенда

- Windows 11: MSVC/PDB, MASM, Visual Studio, WinDbg и Windows dump, Windows ASan.
- Фактические WSL/Kubuntu пользователя: версии ядра, права attach, доступность аппаратных watchpoints, record/rr и особенности Intel i5-12400F. Успех на Azure не гарантирует их поддержку на конкретной машине.
- CT09.1: TUI, клавиши и визуальная проверка в используемом терминале. Автоматический batch не подтверждает TUI.
- CT07.1: системный сбор аварийных core через systemd-coredump, его расположение и политика хранения. Проверен только core, созданный самим GDB.
- CT08.3: SSH до отдельного согласованного хоста и соответствие удалённого бинарника/символов. Локальный gdbserver проверен отдельно.
- `rr`, профилирование PMU/VTune и Docker не входят в этот прогон.

Ни один результат этой технической проверки не записывается в localStorage и не означает, что пользователь прошёл задание.
