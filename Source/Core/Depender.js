/*
---

script: Depender.js

description: A stand alone dependency loader for the MooTools library.

license: MIT-style license

authors:
- Aaron Newton

requires:
- core:1.2.4/Element.Events
- core:1.2.4/Request.JSON
- /MooTools.More
- /Log

provides: Depender

...
*/

var Depender = {

	options: {
		/* 
		onRequire: $empty(options),
		onRequirementLoaded: $empty([scripts, options]),
		onScriptLoaded: $empty({
			script: script, 
			totalLoaded: percentOfTotalLoaded, 
			loaded: scriptsState
		}),
		serial: false,
		target: null,
		noCache: false,
		log: false,*/
		loadedSources: [],
		loadedScripts: ['Core', 'Browser', 'Array', 'String', 'Function', 'Number', 'Hash', 'Element', 'Event', 'Element.Event', 'Class', 'DomReady', 'Class.Extras', 'Request', 'JSON', 'Request.JSON', 'More', 'Depender', 'Log'],
		useScriptInjection: true
	},

	loaded: [],

	sources: {},

	libs: {},

	mapLoaded:true,

	include: function(libs){
		this.log('include: ', libs);
		this.mapLoaded = false;
		var loader = function(data){
			this.libs = $merge(this.libs, data);
			$each(this.libs, function(data, lib){
				if (data.scripts) this.loadSource(lib, data.scripts);
			}, this);
		}.bind(this);
		if ($type(libs) == 'string'){
			this.log('fetching libs ', libs);
			this.request(libs, loader);
		} else {
			loader(libs);
		}
		return this;
	},

	required: [],

	require: function(options){
		this.required.push(options);
		if (this.mapLoaded) this.loaded(this.required.length - 1);
		return this;
	},

	loaded: function(index){
		var options = this.required[index];
		var scripts = this.calculateDependencies(options.scripts);
		if (options.sources){
			options.sources.each(function(source){
				scripts.combine(this.libs[source].files);
			}, this);
		}
		options.scripts = scripts;
		this.required[index] = options;	
		this.fireEvent('require', options);
		scripts.each(function(scr,i){
			this.loadScript(scr, scripts.length == i+1);
		}, this);
	},
	
	cleanDoubleSlash: function(str){
		if (!str) return str;
		var prefix = '';
		if (str.test(/^http:\/\//)){
			prefix = 'http://';
			str = str.substring(7, str.length);
		}
		str = str.replace(/\/\//g, '/');
		return prefix + str;
	},

	request: function(url, callback){
		new Request.JSON({
			url: url,
			secure: false,
			method: 'get',
			onSuccess: callback
		}).send();
	},

	loadSource: function(lib, source){
		if (this.libs[lib].files){
			this.dataLoaded();
			return;
		}
		this.log('loading source: ', source);
		this.request(this.cleanDoubleSlash(source + '/scripts.json'), function(result){
			this.log('loaded source: ', source);
			this.libs[lib].files = result;
			this.dataLoaded();
		}.bind(this));
	},

	dataLoaded: function(){
		var loaded = true;
		$each(this.libs, function(v, k){
			if (!this.libs[k].files) loaded = false;
		}, this);
		if (loaded){
			this.mapTree();
			this.mapLoaded = true;
			this.calculateLoaded();
			this.lastLoaded = this.getLoadedScripts().getLength();
			this.required.each(function(v,i){
				this.loaded(i);
			},this);
		}
	},

	calculateLoaded: function(){
		var set = function(script){
			this.scriptsState[script] = true;
		}.bind(this);
		if (this.options.loadedScripts) this.options.loadedScripts.each(set);
		if (this.options.loadedSources){
			this.options.loadedSources.each(function(lib){
				$each(this.libs[lib].files, function(dir){
					$each(dir, function(data, file){
						set(file);
					}, this);
				}, this);
			}, this);
		}
	},

	deps: {},

	pathMap: {},

	mapTree: function(){
		$each(this.libs, function(data, source){
			$each(data.files, function(scripts, folder){
				$each(scripts, function(details, script){
					var path = source + ':' + folder + ':' + script;
					if (this.deps[path]) return;
					this.deps[path] = details.deps;
					this.pathMap[script] = path;
				}, this);
			}, this);
		}, this);
	},

	calculateDependencies: function(scripts){
		var reqs = [];
		$splat(scripts).each(function(script){
			if (script == 'None' || !script) return;
			var deps = this.deps[this.pathMap[script]] || [];
			deps.each(function(scr){
				if (scr == script || scr == 'None' || !scr) return;
				if (!reqs.contains(scr)) reqs.combine(this.calculateDependencies(scr));
				reqs.include(scr);
			}, this);
			reqs.include(script);
		}, this);
		return reqs;
	},

	getPath: function(script){
		try {
			var chunks = this.pathMap[script].split(':');
			var lib = this.libs[chunks[0]];
			var dir = (lib.path || lib.scripts) + '/';
			chunks.shift();
			return this.cleanDoubleSlash(dir + chunks.join('/') + '.js');
		} catch(e){
			return script;
		}
	},

	toLoad: [],

	loadScript: function(script,last){
		if (this.scriptsState[script] || script == 'None'){
			if (last) this.check();
			if (this.toLoad.length) this.loadScript(this.toLoad.shift(),last);
			return;
		} else if (this.loading){
			this.toLoad.push(script);
			return;
		}
		var finish = function(){
			this.loading = false;
			this.scriptLoaded(script);
			if (this.toLoad.length) this.loadScript(this.toLoad.shift(),last);
		}.bind(this);
		var error = function(){
			this.log('could not load: ', scriptPath);
		}.bind(this);
		this.loading = true;
		var scriptPath = this.getPath(script);
		if (this.options.useScriptInjection){
			this.log('injecting script: ', scriptPath);
			var loaded = function(){
				this.log('loaded script: ', scriptPath);
				finish();
			}.bind(this);
			new Element('script', {
				src: scriptPath + (this.options.noCache ? '?noCache=' + new Date().getTime() : ''),
				events: {
					load: loaded,
					readystatechange: function(){
						if (['loaded', 'complete'].contains(this.readyState)) loaded();
					},
					error: error
				}
			}).inject(this.options.target || document.head);
		} else {
			this.log('requesting script: ', scriptPath);
			new Request({
				url: scriptPath,
				noCache: this.options.noCache,
				onComplete: function(js){
					this.log('loaded script: ', scriptPath);
					$exec(js);
					finish();
				}.bind(this),
				onFailure: error,
				onException: error
			}).send();
		}
	},

	scriptsState: $H(),
	
	getLoadedScripts: function(){
		return this.scriptsState.filter(function(state){
			return state;
		});
	},

	scriptLoaded: function(script){
		this.log('loaded script: ', script);
		this.scriptsState[script] = true;
		this.check();
		var loaded = this.getLoadedScripts();
		var loadedLength = loaded.getLength();
		var toLoad = this.scriptsState.getLength();
		this.fireEvent('scriptLoaded', {
			script: script,
			totalLoaded: (loadedLength / toLoad * 100).round(),
			currentLoaded: ((loadedLength - this.lastLoaded) / (toLoad - this.lastLoaded) * 100).round(),
			loaded: loaded
		});
		if (loadedLength == toLoad) this.lastLoaded = loadedLength;
	},

	lastLoaded: 0,

	check: function(){
		var incomplete = [];
		this.required.some(function(required,i){
			var loaded = [];
			required.scripts.each(function(script){
				if (this.scriptsState[script]) loaded.push(script);
			}, this);
			if (required.onStep){
				required.onStep({
					percent: loaded.length / required.scripts.length * 100,
					scripts: loaded
				});
			};
			if (required.scripts.length != loaded.length) return this.options.serial;
			if (required.callback) required.callback();
			this.required[i] = null;
			this.fireEvent('requirementLoaded', [loaded, required]);
		}, this);
		this.required = this.required.clean();
	}

};

$extend(Depender, new Events);
$extend(Depender, new Options);
$extend(Depender, new Log);

Depender._setOptions = Depender.setOptions;
Depender.setOptions = function(){
	Depender._setOptions.apply(Depender, arguments);
	if (this.options.log) Depender.enableLog();
	return this;
};
