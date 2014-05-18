/*
 * backbone
 * https://github.com/fanlia/jquery.backbone.js
 *
 * Copyright (c) 2013 fanlia
 * Licensed under the MIT license.
 */

(function($) {

  function optionClose (view) {
    if (view.undelegateEvents) { view.undelegateEvents(); }
    if (view.stopListening) { view.stopListening(); }
    if (view.unbind) { view.unbind(); }
    if (view.close) { view.close(); }
  }

  function closeThem (elements) {
    $(elements).each(function() {
      var view = $(this).data('backbone');
      optionClose(view);
    });
  }

  // Collection method.
  $.fn.backbone = function(VIEW, options) {

    return this.each(function() {
      // Do something awesome to each selected element.
      var $this = $(this), oldView = $this.data('backbone');
      
      options = $.extend({}, {el: $this}, options);

      if (oldView) {
        closeThem($this.find(':backbone'));
        optionClose(oldView);
      }

      var newView = VIEW ? new VIEW(options) : null;
      $this.data('backbone', newView);
    });
  };

  // Static method.
  $.backbone = function(VIEW, options) {
    var newView = VIEW ? new VIEW(options) : null;
    newView.$el.data('backbone', newView);

    return newView;
  };

  // Static method default options.
  $.backbone.options = {};

  // Custom selector.
  $.expr[':'].backbone = function(elem) {
    // Is this element awesome?
    return $(elem).data('backbone');
  };

}(jQuery));
