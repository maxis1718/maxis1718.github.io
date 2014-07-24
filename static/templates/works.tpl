<% _.each(works, function( work ){ %>
<table class="project-block">
	<tr>
		<td class="left">
			<div class="project-logo">
				<% if(work.link) { %>
					<a href="<%= work.link %>" target="_blank">
						<img class="img-logo" src="static/img/<%= work.preview %>.png" />
					</a>
				<% } else { %>
					<img class="img-logo" src="static/img/<%= work.preview %>.png" />
				<% } %>
				
			</a>
			</div>
		</td>
		<td class="right">
			<div class="project-name">
				<span>
					<% if(work.link) { %>
						<a href="<%= work.link %>" target="_blank"> <%= work.name %> </a>
					<% } else { %>
						<%= work.name %>
					<% } %>
				</span>
					
				<span class="project-time"> (<%= work.time %>) </span>
				<% if(work.note) { %>
				<span class="project-note"><%= work.note %></span>
				<% } %>
			</div>
			<div class="project-detail">
				<% _.each(work.detail, function(line){ %>
					<p><%= line %></p>
				<% }) %>

			</div>

			<% if(work.team.length > 0) { %>
			<div class="project-teamwork">Work with:<br>
				<% for(var i = 0; i < work.team.length; i ++) { %>
				<% member = work.team[i]; %>
				<span>
					<% if(people) { %>
						<% if(people[member].link) { %>
							<a href="<%= people[member].link %>" target="_blank"><%= people[member].name %></a>
						<% } else { %>
							<%= people[member].name %>
						<% } %>
					<% }else { %>				
						<%= member %>
					<% } %>
					<% if(i == work.team.length-1) { %>
						<%= '' %>
					<% } else { %>
						<%= i == work.team.length-2 ? 'and ' : ', ' %>
					<% } %>					
				</span>
				<% } %>
			</div>
			<% } %>
			
		</td>
	</tr>
</table>
<% }); %>