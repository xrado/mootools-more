/*
Script: Element.Delegation.js
	Extends the Element native object to include the delegate method for more efficient event management.

	Event checking based on the work of Daniel Steigerwald.
	License: MIT-style license.
	Copyright: Copyright (c) 2008 Daniel Steigerwald, daniel.steigerwald.cz

	License:
		MIT-style license.

	Authors:
		Aaron Newton
		Daniel Steigerwald

*/

(function(){
	
	var match = /(.*?):relay\(([^)]+)\)$/,
		combinators = /[+>~\s]/,
		splitType = function(type){
			var bits = type.match(match);
			return !bits ? {event: type} : {
				event: bits[1],
				selector: bits[2]
			};
		},
		check = function(e, selector){
			var t = e.target;
			if (combinators.test(selector = selector.trim())){
				var els = this.getElements(selector);
				for (var i = els.length; i--; ){
					var el = els[i];
					if (t == el || el.hasChild(t)) return el;
				}
			} else {
				for ( ; t && t != this; t = t.parentNode){
					if (Element.match(t, selector)) return document.id(t);
				}
			}
			return null;
		};

	var oldAddEvent = Element.prototype.addEvent,
		oldRemoveEvent = Element.prototype.removeEvent;
		
	Element.implement({

		addEvent: function(type, fn){
			var splitted = splitType(type);
			var delegate = splitted.event;
			if (splitted.selector){
			splitted.event = (delegate == 'mouseenter') ? 'mouseover' : (delegate == 'mouseleave') ? 'mouseout' : splitted.event;
				var monitors = this.retrieve('$moo:delegateMonitors', {});
				if (!monitors[type]){
					var monitor = function(e){
						e.delegate = delegate;
						e.selector = splitted.selector;
						var el = check.call(this, e, splitted.selector);
						if (el) this.fireEvent(type, [e, el], 0, el);
					}.bind(this);
					monitors[type] = monitor;
					oldAddEvent.call(this, splitted.event, monitor);
				}
			}
			return oldAddEvent.apply(this, arguments);
		},

		removeEvent: function(type, fn){
			var splitted = splitType(type);
			if (splitted.selector){
				var events = this.retrieve('events');
				if (!events || !events[type] || (fn && !events[type].keys.contains(fn))) return this;

				if (fn) oldRemoveEvent.apply(this, [type, fn]);
				else oldRemoveEvent.apply(this, type);

				events = this.retrieve('events');
				if (events && events[type] && events[type].length == 0){
					var monitors = this.retrieve('$moo:delegateMonitors', {});
					oldRemoveEvent.apply(this, [splitted.event, monitors[type]]);
					delete monitors[type];
				}
				return this;
			}

			return oldRemoveEvent.apply(this, arguments);
		},

		fireEvent: function(type, args, delay, bind){
			var events = this.retrieve('events');
			if (!events || !events[type]) return this;
			
			var e = args[0],
				el = args[1],
				relatedFrom = e.fromElement || e.relatedTarget,
				relatedTo = e.toElement || e.relatedTarget,
				typeSplit = type.split(':')[0];

			if(e.delegate == 'mouseenter' && el.hasChild(relatedFrom)) return this;
			if(e.delegate == 'mouseleave' && relatedTo && $$(relatedTo.getParents(), relatedTo).contains(el)) return this;  			
			
			events[type].keys.each(function(fn){
				fn.create({bind: bind || this, delay: delay, arguments: args})();
			}, this);
				
			return this;
		}

	});

})();