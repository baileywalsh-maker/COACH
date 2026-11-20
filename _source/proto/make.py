#!/usr/bin/env python3
"""Build the concepts page: the current demo (real app, example data) plus proto/concepts.*"""
import sys
demo, out = sys.argv[1], sys.argv[2]
s = open(demo, encoding='utf-8').read()
css = open('proto/concepts.css', encoding='utf-8').read(); js = open('proto/concepts.js', encoding='utf-8').read()
s = s.replace('<title>COACH Demo</title>', '<title>COACH Concepts</title>')
i = s.rindex('</body>')
s = s[:i] + '<style>\n' + css + '</style>\n<script>\n' + js + '</script>\n' + s[i:]
open(out, 'w', encoding='utf-8').write(s)
