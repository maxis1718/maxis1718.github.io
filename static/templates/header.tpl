<div id="logo"><%= name %></div>
<div id="menu">
	<% for (var i = 0; i < sections.length; i ++){ %>
	<div class="menu-item">
		<span><a href=""><%= sections[i][0].toUpperCase() + sections[i].substring(1) %></a></span>
		<span class="tri"></span>
	</div>
	<% } %>
</div>