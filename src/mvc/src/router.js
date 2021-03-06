/**
 * @fileOverview simple router to get path parameter and query parameter from hash(old ie) or url(html5)
 * @author yiminghe@gmail.com
 */
KISSY.add('mvc/router', function (S, Event, Base) {
    var each = S.each,
    // take a breath to avoid duplicate hashchange
        BREATH_INTERVAL = 100,
        grammar = /(:([\w\d]+))|(\\\*([\w\d]+))/g,
    // all registered route instance
        allRoutes = [],
        win = S.Env.host,
        history = win.history ,
        supportNativeHistory = !!(history && history['pushState']),
        ROUTER_MAP = "__routerMap";

    function findFirstCaptureGroupIndex(regStr) {
        var r, i;
        for (i = 0; i < regStr.length; i++) {
            r = regStr.charAt(i);
            // skip escaped reg meta char
            if (r == "\\") {
                i++;
            } else if (r == "(") {
                return i;
            }
        }
        throw new Error("impossible to not to get capture group in kissy mvc route");
    }

    function getHash() {
        // 不能 location.hash
        // http://xx.com/#yy?z=1
        // ie6 => location.hash = #yy
        // 其他浏览器 => location.hash = #yy?z=1
        return new S.Uri(location.href).getFragment().replace(/^!/, "");
    }

    /**
     * get url fragment and dispatch
     */
    function getFragment() {
        if (Router.nativeHistory && supportNativeHistory) {
            return location.pathname.substr(Router.urlRoot.length) + location.search;
        } else {
            return getHash();
        }
    }

    /**
     * slash ------------- start
     */

    /**
     * whether string end with slash
     * @param str
     */
    function endWithSlash(str) {
        return S.endsWith(str, "/");
    }

    function startWithSlash(str) {
        return S.startsWith(str, "/");
    }

    function removeEndSlash(str) {
        if (endWithSlash(str)) {
            str = str.substring(0, str.length - 1);
        }
        return str;
    }

    function removeStartSlash(str) {
        if (startWithSlash(str)) {
            str = str.substring(1);
        }
        return str;
    }

    function addEndSlash(str) {
        return removeEndSlash(str) + "/";
    }

    function addStartSlash(str) {
        return "/" + removeStartSlash(str);
    }

    function equalsIgnoreSlash(str1, str2) {
        str1 = removeEndSlash(str1);
        str2 = removeEndSlash(str2);
        return str1 == str2;
    }

    /**
     * slash ------------------  end
     */

    /**
     * get full path from fragment for html history
     * @param fragment
     */
    function getFullPath(fragment) {
        return location.protocol + "//" + location.host +
            removeEndSlash(Router.urlRoot) + addStartSlash(fragment)
    }

    /**
     * match url with route intelligently (always get optimal result)
     */
    function dispatch() {
        var query,
            path,
            arg,
            finalRoute = 0,
            finalMatchLength = -1,
            finalRegStr = "",
            finalFirstCaptureGroupIndex = -1,
            finalCallback = 0,
            finalRouteName = "",
            pathUri = new S.Uri(getFragment()),
            finalParam = 0;

        path = pathUri.clone();
        path.query.reset();
        path = path.toString();

        // user input : /xx/yy/zz
        each(allRoutes, function (route) {
            var routeRegs = route[ROUTER_MAP],
            // match exactly
                exactlyMatch = 0;
            each(routeRegs, function (desc) {
                    var reg = desc.reg,
                        regStr = desc.regStr,
                        paramNames = desc.paramNames,
                        firstCaptureGroupIndex = -1,
                        m,
                        name = desc.name,
                        callback = desc.callback;
                    if (m = path.match(reg)) {
                        // match all result item shift out
                        m.shift();

                        function genParam() {
                            if (paramNames) {
                                var params = {};
                                each(m, function (sm, i) {
                                    params[paramNames[i]] = sm;
                                });
                                return params;
                            } else {
                                // if user gave directly reg
                                // then call callback with match result array
                                return [].concat(m);
                            }
                        }

                        function upToFinal() {
                            finalRegStr = regStr;
                            finalFirstCaptureGroupIndex = firstCaptureGroupIndex;
                            finalCallback = callback;
                            finalParam = genParam();
                            finalRoute = route;
                            finalRouteName = name;
                            finalMatchLength = m.length;
                        }

                        // route: /xx/yy/zz
                        if (!m.length) {
                            upToFinal();
                            exactlyMatch = 1;
                            return false;
                        }
                        else if (regStr) {

                            firstCaptureGroupIndex = findFirstCaptureGroupIndex(regStr);

                            // final route : /*
                            // now route : /xx/*
                            if (firstCaptureGroupIndex > finalFirstCaptureGroupIndex) {
                                upToFinal();
                            }

                            else if (
                                firstCaptureGroupIndex == finalFirstCaptureGroupIndex &&
                                    finalMatchLength >= m.length
                                ) {
                                // final route : /xx/:id/:id
                                // now route :  /xx/:id/zz
                                if (m.length < finalMatchLength) {
                                    upToFinal()
                                } else if (regStr.length > finalRegStr.length) {
                                    upToFinal();
                                }
                            }

                            // first route has priority
                            else if (!finalRoute) {
                                upToFinal();
                            }
                        }
                        // if exists user-given reg router rule then update value directly
                        // first route has priority
                        // 用户设置的正则表达式具备高优先级
                        else {
                            upToFinal();
                            exactlyMatch = 1;
                            return false;
                        }
                    }
                }
            );

            if (exactlyMatch) {
                return false;
            }
        });


        if (finalParam) {
            query = pathUri.query.get();
            finalCallback.apply(finalRoute, [finalParam, query]);
            arg = {
                name:finalRouteName,
                "paths":finalParam,
                query:query
            };
            finalRoute.fire('route:' + finalRouteName, arg);
            finalRoute.fire('route', arg);
        }
    }

    /**
     * transform route declaration to router reg
     * @param str
     *         /search/:q
     *         /user/*path
     */
    function transformRouterReg(self, str, callback) {
        var name = str,
            paramNames = [];

        if (S.isFunction(callback)) {
            // escape keyword from regexp
            str = S.escapeRegExp(str);

            str = str.replace(grammar, function (m, g1, g2, g3, g4) {
                paramNames.push(g2 || g4);
                // :name
                if (g2) {
                    return "([^/]+)";
                }
                // *name
                else if (g4) {
                    return "(.*)";
                }
            });

            return {
                name:name,
                paramNames:paramNames,
                reg:new RegExp("^" + str + "$"),
                regStr:str,
                callback:callback
            };
        } else {
            return {
                name:name,
                reg:callback.reg,
                callback:normFn(self, callback.callback)
            };
        }
    }

    /**
     * normalize function by self
     * @param self
     * @param callback
     */
    function normFn(self, callback) {
        if (S.isFunction(callback)) {
            return callback;
        } else if (S.isString(callback)) {
            return self[callback];
        }
        return callback;
    }

    function _afterRoutesChange(e) {
        var self = this;
        self[ROUTER_MAP] = {};
        self.addRoutes(e.newVal);
    }

    /**
     * @name Router
     * @class
     * Router used to route url to responding action callbacks.
     * @memberOf MVC
     * @extends Base
     */
    function Router() {
        var self = this;
        Router.superclass.constructor.apply(self, arguments);
        self.on("afterRoutesChange", _afterRoutesChange, self);
        _afterRoutesChange.call(self, {newVal:self.get("routes")});
        allRoutes.push(self);
    }

    Router.ATTRS =
    /**
     * @lends MVC.Router#
     */
    {
        /**
         * Route and action config.
         * @type Object
         * @example
         * <code>
         *   {
         *     "/search/:param":"callback"
         *     // or
         *     "search":{
         *       reg:/xx/,
         *       callback:fn
         *     }
         *   }
         * </code>
         */
        routes:{}
    };

    S.extend(Router, Base,
        /**
         * @lends MVC.Router#
         */
        {
            /**
             * Add config to current router.
             * @param {Object} routes Route config.
             * @example
             * <code>
             *   {
             *     "/search/:param":"callback"
             *     // or
             *     "search":{
             *       reg:/xx/,
             *       callback:fn
             *     }
             *   }
             * </code>
             */
            addRoutes:function (routes) {
                var self = this;
                each(routes, function (callback, name) {
                    self[ROUTER_MAP][name] = transformRouterReg(self, name, normFn(self, callback));
                });
            }
        },
        /**
         * @lends MVC.Router
         */
        {

            /**
             * Navigate to specified path.
             * @param {String} path Destination path.
             * @param {Object} [opts] Config for current navigation.
             * @param {Boolean} opts.triggerRoute Whether to trigger responding action
             *                  even current path is same as parameter
             */
            navigate:function (path, opts) {
                if (getFragment() !== path) {
                    if (Router.nativeHistory && supportNativeHistory) {
                        history['pushState']({}, "", getFullPath(path));
                        // pushState does not fire popstate event (unlike hashchange)
                        // so popstate is not statechange
                        // fire manually
                        dispatch();
                    } else {
                        location.hash = "!" + path;
                    }
                } else if (opts && opts.triggerRoute) {
                    dispatch();
                }
            },
            /**
             * Start router (url monitor).
             * @param {object} opts
             * @param {Function} opts.success Callback function to be called after router is started.
             * @param {String} opts.urlRoot Specify url root for html5 history management.
             * @param {Boolean} opts.nativeHistory Whether enable html5 history management.
             */
            start:function (opts) {

                if (Router.__started) {
                    return;
                }

                opts = opts || {};

                opts.urlRoot = opts.urlRoot || "";

                var urlRoot,
                    nativeHistory = opts.nativeHistory,
                    locPath = location.pathname,
                    hash = getFragment(),
                    hashIsValid = location.hash.match(/#!.+/);

                urlRoot = Router.urlRoot = opts.urlRoot;
                Router.nativeHistory = nativeHistory;

                if (nativeHistory) {

                    if (supportNativeHistory) {
                        // http://x.com/#!/x/y
                        // =>
                        // http://x.com/x/y
                        // =>
                        // process without refresh page and add history entry
                        if (hashIsValid) {
                            if (equalsIgnoreSlash(locPath, urlRoot)) {
                                // put hash to path
                                history['replaceState']({}, "", getFullPath(hash));
                                opts.triggerRoute = 1;
                            } else {
                                S.error("location path must be same with urlRoot!");
                            }
                        }
                    }
                    // http://x.com/x/y
                    // =>
                    // http://x.com/#!/x/y
                    // =>
                    // refresh page without add history entry
                    else if (!equalsIgnoreSlash(locPath, urlRoot)) {
                        location.replace(addEndSlash(urlRoot) + "#!" + hash);
                        return;
                    }

                }

                // prevent hashChange trigger on start
                setTimeout(function () {
                    if (nativeHistory && supportNativeHistory) {
                        Event.on(win, 'popstate', dispatch);
                    } else {
                        Event.on(win, "hashchange", dispatch);
                        opts.triggerRoute = 1;
                    }

                    // check initial hash on start
                    // in case server does not render initial state correctly
                    // when monitor hashchange ,client must be responsible for dispatching and rendering.
                    if (opts.triggerRoute) {
                        dispatch();
                    }
                    opts.success && opts.success();

                }, BREATH_INTERVAL);

                Router.__started = 1;
            }
        });

    return Router;

}, {
    requires:['event', 'base']
});

/**
 * 2011-11-30
 *  - support user-given native regexp for router rule
 *
 * refer :
 * http://www.w3.org/TR/html5/history.html
 * http://documentcloud.github.com/backbone/
 **/