import sys
class Doc:
    def __init__(self, path): self.path = path; self.s = open(path).read(); self.n = 0
    def rep(self, old, new, count=1):
        c = self.s.count(old)
        if c != count:
            print(f'!! {self.path}: expected {count} occurrence(s), found {c}: {old[:90]!r}'); sys.exit(1)
        self.s = self.s.replace(old, new); self.n += 1
    def after(self, anchor, add):   # insert `add` right after the unique anchor
        self.rep(anchor, anchor + add)
    def before(self, anchor, add):
        self.rep(anchor, add + anchor)
    def save(self): open(self.path, 'w').write(self.s); print(f'{self.path}: {self.n} edits applied')
