$(document).ready(function(){

	var router = new myRoute();
	Backbone.history.start();

});
var data = {
	header: {
		name : "WTF?",
		sections: ["about", "works", "publications"],
	},
	select: 'about' // default select
}

var myRoute = Backbone.Router.extend({
	routes: {
		"about": "about",
		"works": "works",
		"publications": "publications",
	},
	about: function() {
		data.select = 'about';
		var view = new mainView();
		view.render([ 
			{ templateName: "header", 	rc: data, entry: $("#header"),	callback: null 	},
			{ templateName: "about", 	rc: data, entry: $("#content"),	callback: null	}
		]);

	},
	works: function() {
		data.select = 'works';
		var view = new mainView();
		view.render([ 
			{ templateName: "header", 	rc: data, entry: $("#header"),	callback: null 	},
			{ templateName: "works", 	rc: data, entry: $("#content"),	callback: null	}
		]);
	},
	publications: function() {
		data.select = 'publications';
		var view = new mainView();
		view.render([ 
			{ templateName: "header", 		rc: data, entry: $("#header"),	callback: null 	},
			{ templateName: "publications", rc: data, entry: $("#content"),	callback: null	}
		]);
	},
});


/* load tempalte file and render it to #entry */
function loadTemplate( templateName , data , entry , callback ){

    $.ajax({
		// url : "/hb-template/" + templateName + ".tpl" ,
		url: '/static/templates/'+templateName+".tpl",
		dataType: "text",
		success : function (template) {
            
            var rendered = _.template(template, data);

			/* put html string into entry */
			entry.html( rendered );	

			if(callback){
				callback();
			}
        }
    });
    
}

var mainView = Backbone.View.extend({

    initialize: function(){
    },
    render: function(args){
    	_.each(args, function( arg ){
    		loadTemplate(arg.templateName, arg.rc, arg.entry, arg.callback)
    	});
    }
});