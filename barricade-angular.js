/*
 * Barricade-Angular
 * Copyright (C)2014 2Toad, LLC.
 * http://2toad.github.io/Barricade-Angular
 * 
 * Version: 1.1.0
 * License: MIT
 */

angular.module("barricade", [])

.factory("barricade", ["$http", "$cookieStore", "$rootScope", "$location", function($http, $cookieStore, $rootScope, $location) {
    return $rootScope.barricade = {
        tokenRequestUrl: undefined,
        tokenInvalidateUrl: undefined,
        loginTemplateUrl: undefined,
        serverErrorTemplateUrl: undefined,
		exclusions: [],
        onError500: undefined,
        onError403: undefined,
        noAuth: undefined,
        authorized: undefined,
        expired: undefined,
        lastNoAuth: undefined,
        
        init: function(rememberMe, config) {
            $.extend(this, config);
			this.formatExclusions();

            $rootScope.$on("$routeChangeStart", function(event, next, current) {
                this.noAuth = next.noAuth;
                this.lastNoAuth = current 
                    ? current.noAuth ? current.originalPath : this.lastNoAuth
                    : next.noAuth ? next.originalPath : this.lastNoAuth;
            }.bind(this));
            
            if (rememberMe) {
                var cookie = $cookieStore.get("barricade");
                if (cookie) {
                    if (cookie.expiration < $.now())
                        this.setStatus(420);
                    else {
                        this.setHeader(cookie.token);
                        this.setStatus(200);
                    }
                }
            }
        },
        login: function(username, password, tokenRequestUrl) {
            return $http.post(tokenRequestUrl || this.tokenRequestUrl, {"Username": username, "Password": password})
                .success(function(data) {                   
                    var cookie = {
                       token: data.access_token
                      ,expiration: $.now() + (data.expires_in * 1000)
                    };
                    
                    this.setHeader(cookie.token);
                    $cookieStore.put("barricade", cookie);
                    
                    this.setStatus(200);

                    if (this.reload) {
                        // TODO: We append a hash to the path so Angular will reload 
                        // the view. This works, but it's kind of hacky.
                        $location.hash($.now());
                        this.reload = false;
                    }
                }.bind(this));
        },
        logout: function(tokenInvalidateUrl) {
            var promise = $http.post(tokenInvalidateUrl || this.tokenInvalidateUrl);
            promise.finally(function() {
                delete $http.defaults.headers.common["Authorization"];
                $cookieStore.remove("barricade");
                this.setStatus(401);
            }.bind(this));
            return promise;
        },
        setHeader: function(bearerToken) {
            $http.defaults.headers.common["Authorization"] = "Bearer " + bearerToken;
        },
        setStatus: function(status) {           
            this.authorized = status == 200;
            this.expired = status == 420;
        },
        isAuthorized: function() {
            return this.authorized === true || this.noAuth === true;
        },
        formatExclusions: function() {
            // Exclude Barricade API URL's
            this.exclusions.push(this.serverErrorTemplateUrl);
            this.exclusions.push(this.loginTemplateUrl);
            this.exclusions.push(this.tokenRequestUrl);

            var formatted = [];
            angular.forEach(this.exclusions, function(value) {
                this.push(value.toLowerCase());
            }, formatted);
            this.exclusions = formatted;
        }
    };
}])

.factory("barricade.interceptor", ["$rootScope", "$q", function($rootScope, $q) {
    return {
        request: function(config) {
            // Authorized?
            if ($rootScope.barricade.isAuthorized() 
                    // Skip excluded URL's
                    || $rootScope.barricade.exclusions.indexOf(config.url.toLowerCase()) > -1)
                return config || $q.when(config);

            // Not authorized, so flag it for a reload after a successful login()
            // and block this request from going to the server
            $rootScope.barricade.reload = true;
            return $q.reject(401);
        },
        responseError: function(rejection) {
            switch(rejection.status) {
                case 401:
                    $rootScope.barricade.setStatus(401);
                    break;
                case 403:
                    $rootScope.barricade.onError403(rejection);
                    break;
                case 500:
                    $rootScope.barricade.onError500(rejection);
                    break;
            }
            return $q.reject(rejection);
        }
    };
}])

.config(["$httpProvider", function($httpProvider) {
    $httpProvider.interceptors.push("barricade.interceptor");
}]);