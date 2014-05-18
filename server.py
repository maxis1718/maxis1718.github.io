# -*- coding: UTF-8 -*-

# system
from flask import Flask, render_template, request, redirect, url_for
import jinja2

# import util

app = Flask(__name__)

my_loader = jinja2.ChoiceLoader([
	app.jinja_loader,
	jinja2.FileSystemLoader('/Users/maxis/projects/maxis1718.github.io/'),
])

app.jinja_loader = my_loader

# pages = ['profile', 'projects', 'publications', 'cv', 'about']

# meta = {}
# meta['Keywords'] = ['NTHU,清華大學,自然語言,NLP,Maxis,Kao,高定慧']
# meta['Description'] = "Maxis Kao's personal website."
# meta['Date'] = '2014-02-26'
# meta['Author'] = 'Maxis Kao'


# def current(target):
# 	selected = dict([(p, '' if p != target else 'selected' ) for p in pages])
# 	triangle = dict([(p, 'hide' if p != target else '' ) for p in pages])
# 	return (selected, triangle)



@app.route('/')
def hello():
	return render_template( 'index.html' )

if __name__ == "__main__":
	app.debug = True
	app.run(host="0.0.0.0", port=5000)
