# -*- coding: UTF-8 -*-

from flask import Flask, render_template, request, redirect, url_for
import jinja2

app = Flask(__name__)

my_loader = jinja2.ChoiceLoader([
	app.jinja_loader,
	jinja2.FileSystemLoader('/Users/maxis/projects/maxis1718.github.io/'),
])

app.jinja_loader = my_loader

@app.route('/')
def hello():
	return render_template( 'index.html' )

if __name__ == "__main__":
	app.debug = True
	app.run(host="0.0.0.0", port=12345)
