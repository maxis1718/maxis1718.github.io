{% extends "layout.tpl" %}

{% block content %}
	
	{% for project in projects %}
	<table class="project-block">
		<tr>
			<td class="left">
				<div class="project-logo">
					<a href="{{ project['link'] }}" target="_blank">
					<img class="img-logo" src= "{{ url_for('static', filename=project['logo']) }}" />
					<!-- <img class="img-logo" src= "{{  '/static/' + project['logo'] }}" /> !-->
				</a>
				</div>
			</td>
			<td class="right">
				<div class="project-name">
					<span><a href="{{ project['link'] }}" target="_blank"> {{ project['name'] }} </a></span>
					<span class="project-time"> {{ project['time'] }} </span>
					{% if project['note'] %}
					<span class="project-note">{{ project['note'] }}</span>
					{% endif %}
				</div>
				<div class="project-detail"> 
				{% autoescape off %}
					{{ project['detail'] }} 
				{% endautoescape %}
				</div>
				<div class="project-teamwork">Work with:<br>
					{% for member in project['team'] %}
					<span>
						<a href="{{ member['link'] }}" target="_blank">{{ member['name'] }}</a> {{ member['delimiter'] }}
					</span>
					{% endfor %}
				</div>
			</td>
		</tr>
	</table>
	{% endfor %}

{% endblock %}
