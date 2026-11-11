#!/usr/bin/env python3
"""Machine-check the course map / skills / unlock table inside docs/design/contracts.md."""
import re, sys, collections
src = open('/Users/fpl0/Code/Oak/docs/design/contracts.md').read()
lines = src.split('\n')
def section(start, end):
    a = src.index(start); b = src.index(end, a); return src[a:b]
def rows(text):
    out = []
    for l in text.split('\n'):
        if l.startswith('|') and not re.match(r'^\|[-| ]+\|$', l):
            cells = [c.strip() for c in re.split(r'(?<!\\)\|', l.strip().strip('|'))]
            out.append(cells)
    return out
errs = []
def err(m): errs.append(m); print('ERR', m)

# --- lessons
sec2 = section('### 2.3 Core units', '### 2.7 Session counts')
lessons = collections.OrderedDict()
for c in rows(sec2):
    if re.match(r'^(U\d\d|[JRA]\d|J|R|A)\.(L\d\d|CP\d?)$', c[0]) and len(c) >= 5:
        lessons[c[0]] = dict(title=c[1], obj=c[2], intro=[x for x in c[3].split() if x != '—'], prac=[x for x in c[4].split() if x != '—'])
    elif re.match(r'^[JRA]C\d\.S\d$', c[0]):
        lessons[c[0]] = dict(title=c[1], obj=c[2], intro=[], prac=[])
caps = [c[0] for c in rows(section('### 2.4 Core capstones', '### 2.5')) if re.match(r'^(C\d|X\d|CF-[AT])\.S\d$', c[0])]
print('lessons+cps parsed:', len(lessons), 'core capstone sessions:', len(caps))
# --- default order
order_txt = section('```\n1:U00.L01', '```\n\nLandmarks')
order = re.findall(r'(\d+):(\S+)', order_txt)
ids = [i for _, i in order]
assert [int(n) for n, _ in order] == list(range(1, len(order) + 1)), 'order numbering'
print('default order sessions:', len(ids))
dup = [k for k, v in collections.Counter(ids).items() if v > 1]
if dup: err(f'duplicate in order: {dup}')
core_expected = [k for k in lessons if k.startswith('U')] + caps
gym = [i for i in ids if i.startswith('GYM')]
missing = set(core_expected) - set(ids); extra = set(ids) - set(core_expected) - set(gym)
if missing: err(f'missing from order: {sorted(missing)}')
if extra: err(f'unknown in order: {sorted(extra)}')
pos = {i: n for n, i in enumerate(ids)}
# lessons in order
core_lessons = [k for k in lessons if re.match(r'^U\d\d\.L', k)]
for a, b in zip(core_lessons, core_lessons[1:]):
    if pos[a] > pos[b]: err(f'lesson order {a} after {b}')
# CP placement: after next unit's L01
for k in lessons:
    m = re.match(r'^(U\d\d)\.CP$', k)
    if m:
        nxt = 'U%02d.L01' % (int(m.group(1)[1:]) + 1)
        if nxt in pos and not (pos[k] > pos[nxt]): err(f'{k} not after {nxt}')
        if nxt in pos and pos[k] > pos.get('U%02d.L03' % (int(m.group(1)[1:]) + 1), 10**6): err(f'{k} after next L03')
# gym slot rule
cnt = 0; started = False
transcr = lambda s: s.startswith('GYM') or s.startswith('X') or s.startswith('CF-T')
for n, s in enumerate(ids):
    if s == 'U07.L01': started = True
    if not started: continue
    if transcr(s):
        if cnt < 4 and s.startswith('GYM') : err(f'gym {s} at {n+1} after only {cnt}')
        cnt = 0
    else:
        cnt += 1
        if cnt > 4:
            # allowed only if inside a capstone in progress
            cap = re.match(r'^(C\d|CF-A)\.S(\d)', s)
            if not (cap and int(cap.group(2)) > 1) : err(f'slot overdue at {n+1}:{s} cnt={cnt}')
# --- skills
sk = {}
for c in rows(section('### 4.1 Nodes and edges', '### 4.2')):
    if re.match(r'^[RPNSICHBMFEVJD]\d\d[ab]?$', c[0]):
        sk[c[0]] = dict(name=c[1], kind=c[3], pre=[x for x in c[4].split() if x != '—'], at=c[5])
print('skills:', len(sk))
intro_at = {}
for L, d in lessons.items():
    for s in d['intro']:
        if s in intro_at: err(f'{s} introduced twice: {intro_at[s]} and {L}')
        intro_at[s] = L
    for s in d['intro'] + d['prac']:
        if s not in sk: err(f'{L}: unknown skill {s}')
for s, d in sk.items():
    if s not in intro_at: err(f'skill {s} has no introducing lesson (table says {d["at"]})')
    elif intro_at[s] != d['at']: err(f'skill {s}: table says {d["at"]}, lesson list says {intro_at[s]}')
    for p in d['pre']:
        if p not in sk: err(f'skill {s}: unknown prereq {p}')
# legal-order model: guaranteed-before sets
track = collections.OrderedDict()
for k in lessons:
    if re.match(r'^[JRA]\d\.L', k): track.setdefault(k[0], []).append(k)
gates = {}
def gate_of(L):
    if L.startswith('A1.') and int(L[-2:]) <= 4: return ['U03.L02']
    if L.startswith('A1.'): return ['U09.CP']
    if L.startswith('A2.'): return ['U10.CP']
    if L.startswith('R'): return ['U13.CP']
    if L == 'J2.L04': return ['U13.CP', 'U14.CP']
    if L[:2] in ('J1', 'J2', 'J3'): return ['U13.CP']
    if L.startswith('J4'): return ['U13.CP', 'U15.L06']
    if L.startswith('J5'): return ['U13.CP', 'U17.CP']
cp_cover_last = {}  # CP -> last covered lesson
cps_core = [k for k in lessons if re.match(r'^U\d\d\.CP$', k)]
def before_core(x):
    """set of core lessons guaranteed completed before core item x starts (strictly linear lessons)."""
    if x.endswith('.CP'):
        u = int(x[1:3]); last = [l for l in core_lessons if int(l[1:3]) <= u][-1]
        return set(core_lessons[:core_lessons.index(last) + 1])
    return set(core_lessons[:core_lessons.index(x)])
def guaranteed(L):
    if L.startswith('U'): return before_core(L)
    g = set()
    for gt in gate_of(L):
        g |= before_core(gt) | ({gt} if not gt.endswith('.CP') else set())
    t = track[L[0]]
    prev = [p for p in t[:t.index(L)] if p != 'J2.L04']   # J2.L04 may be skipped while U14.CP is unpassed
    if L.startswith(('J4', 'J5')) : pass
    for p in prev:
        g.add(p); g |= guaranteed(p)
    return g
for s, d in sk.items():
    L = intro_at.get(s)
    if not L: continue
    G = guaranteed(L)
    for p in d['pre']:
        pl = intro_at.get(p)
        if pl is None: continue
        if pl == L:
            if lessons[L]['intro'].index(p) > lessons[L]['intro'].index(s): err(f'{s}@{L}: same-lesson prereq {p} listed after it')
        elif pl not in G: err(f'{s}@{L}: prereq {p}@{pl} not guaranteed earlier')
for L, d in lessons.items():
    if '.L' not in L: continue
    G = guaranteed(L)
    for s in d['prac']:
        pl = intro_at.get(s)
        if pl and pl != L and pl not in G: err(f'{L} practises {s} introduced at {pl}, not guaranteed earlier')
# --- unlock table
unl = {}
allsess = set(lessons) | set(caps) | {'CF-T.S1'}
for c in rows(section('### 3.2 The table', '### 3.3')):
    m = re.match(r'^`((?:tb|snd|scale|chord)\.[^`]+)`$', c[0])
    if m:
        at = c[2].rstrip('*').strip()
        if m.group(1) in unl: err(f'duplicate unlock row {m.group(1)}')
        unl[m.group(1)] = at
        for a in re.split(r'\s*\|\s*|\s+or\s+', at):
            a = a.replace('START', '').strip().rstrip('*')
            if a and a not in allsess: err(f'unlock {m.group(1)} at unknown session "{a}"')
print('unlock rows:', len(unl))
# --- families
for c in rows(section('### 7.3 Family catalog', '### 7.4')):
    if re.match(r'^`(fam|deck)\.', c[0]):
        for s in re.findall(r'\b(?:U\d\d|[JRA]\d)\.L\d\d\b', c[2]):
            if s not in lessons: err(f'family {c[0]}: unknown lesson {s}')
        for s in re.findall(r'\b[RPNSICHBMFEVJD]\d\d[ab]?\b', c[3]):
            if s not in sk: err(f'family {c[0]}: unknown skill {s}')
        first = re.match(r'^((?:U\d\d|[JRA]\d)\.L\d\d)', c[2])
        if first:
            G = guaranteed(first.group(1)) | {first.group(1)}
            for s in re.findall(r'\b[RPNSICHBMFEVJD]\d\d[ab]?\b', c[3]):
                pass
# --- checkpoint map
cpm = {}
for c in rows(section('**Checkpoint map**', '### 7.7')):
    if re.match(r'^(U\d\d|J|R|A)\.CP', c[0]):
        parts = [c[0] + ' | ' + c[1]]
        for p in parts:
            p = p.strip()
            m = re.match(r'^([UJRA][\d.]*CP\d?)\s*[|:]\s*(.*)$', p)
            if not m: err('cannot parse cp row ' + p); continue
            name, body = m.group(1), m.group(2)
            ids_ = []
            for tok in re.findall(r'[RPNSICHBMFEVJD]\d\d[ab]?(?:–[RPNSICHBMFEVJD]\d\d)?', body):
                if '–' in tok:
                    a, b = tok.split('–'); ids_ += [f'{a[0]}{i:02d}' for i in range(int(a[1:]), int(b[1:]) + 1)]
                else: ids_.append(tok)
            cpm[name] = ids_
seen = collections.Counter(x for v in cpm.values() for x in v)
for name, v in cpm.items():
    for s in v:
        if s not in sk: err(f'{name}: unknown skill {s}'); continue
        L = intro_at[s]
        # skill must be introduced before the CP in guaranteed sense
        if name.startswith('U'):
            if L.startswith('U') and L not in before_core(name): err(f'{name} tests {s} introduced at {L} (later)')
            if not L.startswith('U'): err(f'{name} tests advanced skill {s}')
        else:
            if L.startswith('U') and name == 'A.CP' and s == 'D05': pass
print('skills in >1 checkpoint:', {k: [n for n, v in cpm.items() if k in v] for k, c in seen.items() if c > 1})
print('skills in no checkpoint:', sorted(set(sk) - set(seen)))
# session counts table
print('ERRORS:', len(errs))
