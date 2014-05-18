<div id="logo"><%= header.name %></div>
<div id="menu">
	<% for(var i = 0; i < header.sections.length; i++ ) { %>

	<div class="menu-item <%= select == header.sections[i] ? 'selected' : '' %>" >
		<span><a href="#<%= header.sections[i] %>"><%= header.sections[i] %></a></span>
		<span class="tri <%= select == header.sections[i] ? '' : 'hide' %>"></span>
	</div>
	<% } %>
</div>