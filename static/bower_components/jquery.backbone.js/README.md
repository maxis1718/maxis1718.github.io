# Jquery.Backbone

a very simple implementation that extends jquery for backone with lifecycle management 

## Getting Started
Download the [production version][min] or the [development version][max].

[min]: https://raw.github.com/fanlia/jquery.backbone.js/master/dist/jquery.backbone.min.js
[max]: https://raw.github.com/fanlia/jquery.backbone.js/master/dist/jquery.backbone.js

In your web page:

```html
<script src="jquery.js"></script>
<script src="http://backbonejs.org/backbone-min.js"></script>
<script src="dist/jquery.backbone.min.js"></script>
<script>
jQuery(function($) {
  var View = Backbone.View.extend({});
  var OtherView = Backbone.View.extend({});
  var options = {}; //directly passed to new View(options);
  var someView = $.backbone(View, options); // same to new View
  $('.someView').backbone(View, options); // directly render View to '.someView'

  // when we try to render another view to '.someView', 
  // it will free the `old view` (someView) and `child view` first.
  $('.someView').backbone(OtherView, options);
});
</script>
```

## Documentation
  many of times we try to extend backbone by add something new, like new namespaces, new restrictions. maybe it is easier to extend jquery than backbone with the same effect and
  less code.