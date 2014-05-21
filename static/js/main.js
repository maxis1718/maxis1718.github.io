$(document).ready(function(){
	var router = new myRoute();
	Backbone.history.start();
	events();
});

var works = [];
var sheets = {
	'works': 'https://docs.google.com/spreadsheets/d/10Pjg-jHMopainPFm0Yb9qy9U5rF1D3Km6G5zmCehm40/pubhtml',
	'publications': ''
}
var people = false;


function tableInit(public_spreadsheet_url, callback_function){
	Tabletop.init( { key: public_spreadsheet_url, callback: callback_function, simpleSheet: true })
}

function RenderWorks(sheet, people, tabletop) {
	// console.log(sheet, type);
	var view = new mainView();
	view.render([ 
		{ templateName: "header", 	rc: data, 						entry: $("#header"),	callback: null 	},
		{ templateName: "works", 	rc: {works: sheet, people: people}, entry: $("#content"),	callback: null	}
	]);
}

function RenderPublications(sheet, tabletop) {
	// console.log(sheet);
	var view = new mainView();
	view.render([ 
		{ templateName: "header", 		rc: data, 			entry: $("#header"),	callback: null 	},
		{ templateName: "publications", rc: {works: sheet}, entry: $("#content"),	callback: null	}
	]);
}

// https://docs.google.com/spreadsheets/d/10Pjg-jHMopainPFm0Yb9qy9U5rF1D3Km6G5zmCehm40/pubhtml

var data = {
	header: {
		name : "Maxis Kao",
		sections: ["about", "works", "publications"],
	},
	select: 'about' // default select
}

function loadWorks(sectionName) {
	$.getJSON('/static/files/'+'works'+'.json', function(d) {
		
		if(d){
			console.log('got work data:',d);
			if(people){
				console.log('already got people:',people);
				RenderWorks(d, people);
			}else{
				console.log('no people, fetching....');
				$.getJSON('/static/files/people.json', function(p) {
					
					people = p;
					console.log('got poeple', people)
					RenderWorks(d, people);
				}).error(function(){
					RenderWorks(d);
				});
			}
			
		}else {
			console.log('!!!!!');
			tableInit(sheets[section], RenderWorks);
		}
	}).error(function(){
		console.log('!!!!!');
		tableInit(sheets[section], RenderWorks);
		
	});
}

var myRoute = Backbone.Router.extend({
	routes: {
		"" : "about",
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

		loadWorks('works');
	},
	publications: function() {
		data.select = 'publications';

		// tableInit(sheets['publications'], RenderPublications);

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
		url: 'static/templates/'+templateName+".tpl",
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


//// ------------------------------------------------------------------------------------ ////


function events() {
	var social_imgs = $('.socialnetwork-block').find('img');
	social_imgs.mouseenter(function(){
		$('#social-note').text( $(this).attr('alt') );
	}).mouseleave(function(){
		$('#social-note').text( 'FOLLOW:' );
	});
}