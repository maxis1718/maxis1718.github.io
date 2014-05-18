$(document).ready(function(){
	var headerViewer = new headerView({ el: $('#header') });
	headerViewer.render();
});

var header = {
	name : "Maxis Kao",
	sections: ["about", "works", "publications"]
}

var headerView = Backbone.View.extend({

    initialize: function(){
    },
    render: function(){
    	// 
    	el = this.$el;
    	// get template
        $.get('/static/templates/header.tpl', function (template) {
            var rendered = _.template(template, header);
            el.html(rendered);
        }, 'html');
    }
});

