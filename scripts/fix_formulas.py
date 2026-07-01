# -*- coding: utf-8 -*-
"""Fix double backslashes in LaTeX math formulas"""
import re
from pathlib import Path

INPUT = Path(r'D:\Code\WindEye\docs\paper_draft.md')

with open(INPUT, 'r', encoding='utf-8') as f:
    text = f.read()

# Count formulas before fix
dollar_pairs = text.count('$')
print(f'$ count before: {dollar_pairs}')

# Fix double backslashes inside inline math ($...$)
def fix_inline_math(m):
    content = m.group(1)
    content = content.replace('\\\\', '\\')
    return '$' + content + '$'

text = re.sub(r'\$([^$]+?)\$', fix_inline_math, text)

# Fix double backslashes inside display math ($$...$$)
def fix_display_math(m):
    content = m.group(1)
    content = content.replace('\\\\', '\\')
    return '$$' + content + '$$'

text = re.sub(r'\$\$([^$]+?)\$\$', fix_display_math, text)

with open(INPUT, 'w', encoding='utf-8') as f:
    f.write(text)

print(f'File saved: {len(text)} chars')

# Verify g(q) formula
idx = text.find('g(q)')
if idx >= 0:
    snippet = text[idx-20:idx+120]
    # Print without repr to see actual characters
    print('g(q) formula snippet:')
    print(snippet)
    # Check for double backslash
    if '\\\\' in snippet:
        print('WARNING: still has double backslashes!')
    else:
        print('OK: no double backslashes')
else:
    print('g(q) not found')

# Also verify EvidenceChain formula
idx2 = text.find('EvidenceChain')
if idx2 >= 0:
    snippet2 = text[idx2:idx2+200]
    print('\nEvidenceChain snippet:')
    print(snippet2)
    if '\\\\' in snippet2:
        print('WARNING: still has double backslashes!')
    else:
        print('OK: no double backslashes')
