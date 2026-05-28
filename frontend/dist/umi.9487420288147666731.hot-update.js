globalThis.makoModuleHotUpdate('src/.umi/umi.ts?hmr', {
    modules: {
        "src/.umi/core/route.tsx": function(module, exports, __mako_require__) {
            "use strict";
            var interop = __mako_require__("@swc/helpers/_/_interop_require_wildcard")._;
            __mako_require__.d(exports, "__esModule", {
                value: true
            });
            __mako_require__.d(exports, "getRoutes", {
                enumerable: true,
                get: function() {
                    return getRoutes;
                }
            });
            var _interop_require_default = __mako_require__("@swc/helpers/_/_interop_require_default");
            var _interop_require_wildcard = __mako_require__("@swc/helpers/_/_interop_require_wildcard");
            var _reactrefresh = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
            var _react = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/react/index.js"));
            var prevRefreshReg;
            var prevRefreshSig;
            prevRefreshReg = self.$RefreshReg$;
            prevRefreshSig = self.$RefreshSig$;
            self.$RefreshReg$ = (type, id)=>{
                _reactrefresh.register(type, module.id + id);
            };
            self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
            async function getRoutes() {
                const routes = {
                    "1": {
                        "path": "/user",
                        "layout": false,
                        "id": "1"
                    },
                    "2": {
                        "name": "login",
                        "path": "/user/login",
                        "parentId": "1",
                        "id": "2"
                    },
                    "3": {
                        "path": "/welcome",
                        "name": "welcome",
                        "icon": "dashboard",
                        "parentId": "ant-design-pro-layout",
                        "id": "3"
                    },
                    "4": {
                        "path": "/knowledge-build",
                        "name": "knowledge-build",
                        "icon": "tool",
                        "parentId": "ant-design-pro-layout",
                        "id": "4"
                    },
                    "5": {
                        "path": "/knowledge-graph",
                        "name": "knowledge-graph",
                        "icon": "cluster",
                        "parentId": "ant-design-pro-layout",
                        "id": "5"
                    },
                    "6": {
                        "path": "/knowledge-graph/subject",
                        "name": "knowledge-graph-subject",
                        "icon": "team",
                        "parentId": "ant-design-pro-layout",
                        "id": "6"
                    },
                    "7": {
                        "path": "/knowledge-graph/event",
                        "name": "knowledge-graph-event",
                        "icon": "thunderbolt",
                        "parentId": "ant-design-pro-layout",
                        "id": "7"
                    },
                    "8": {
                        "path": "/knowledge-graph/feature",
                        "name": "knowledge-graph-feature",
                        "icon": "dotChart",
                        "parentId": "ant-design-pro-layout",
                        "id": "8"
                    },
                    "9": {
                        "path": "/knowledge-graph/regulation",
                        "name": "knowledge-graph-regulation",
                        "icon": "safetyCertificate",
                        "parentId": "ant-design-pro-layout",
                        "id": "9"
                    },
                    "10": {
                        "path": "/knowledge-qa",
                        "name": "knowledge-qa",
                        "icon": "message",
                        "parentId": "ant-design-pro-layout",
                        "id": "10"
                    },
                    "11": {
                        "path": "/community-discovery",
                        "name": "community-discovery",
                        "icon": "radarChart",
                        "parentId": "ant-design-pro-layout",
                        "id": "11"
                    },
                    "12": {
                        "path": "/",
                        "redirect": "/welcome",
                        "parentId": "ant-design-pro-layout",
                        "id": "12"
                    },
                    "13": {
                        "layout": false,
                        "path": "./*",
                        "id": "13"
                    },
                    "ant-design-pro-layout": {
                        "id": "ant-design-pro-layout",
                        "path": "/",
                        "isLayout": true
                    },
                    "umi/plugin/openapi": {
                        "path": "/umi/plugin/openapi",
                        "id": "umi/plugin/openapi"
                    }
                };
                return {
                    routes,
                    routeComponents: {
                        '1': /*#__PURE__*/ _react.default.lazy(()=>__mako_require__.ensure2("src/.umi/core/EmptyRoute.tsx").then(__mako_require__.dr(interop, __mako_require__.bind(__mako_require__, "src/.umi/core/EmptyRoute.tsx")))),
                        '2': /*#__PURE__*/ _react.default.lazy(()=>__mako_require__.ensure2("src/pages/user/login/index.tsx").then(__mako_require__.dr(interop, __mako_require__.bind(__mako_require__, "src/pages/user/login/index.tsx")))),
                        '3': /*#__PURE__*/ _react.default.lazy(()=>__mako_require__.ensure2("src/pages/Welcome.tsx").then(__mako_require__.dr(interop, __mako_require__.bind(__mako_require__, "src/pages/Welcome.tsx")))),
                        '4': /*#__PURE__*/ _react.default.lazy(()=>__mako_require__.ensure2("src/pages/KnowledgeBuild/index.tsx").then(__mako_require__.dr(interop, __mako_require__.bind(__mako_require__, "src/pages/KnowledgeBuild/index.tsx")))),
                        '5': /*#__PURE__*/ _react.default.lazy(()=>__mako_require__.ensure2("src/pages/GeneralPage.tsx").then(__mako_require__.dr(interop, __mako_require__.bind(__mako_require__, "src/pages/GeneralPage.tsx")))),
                        '6': /*#__PURE__*/ _react.default.lazy(()=>__mako_require__.ensure2("src/pages/SubjectPage.tsx").then(__mako_require__.dr(interop, __mako_require__.bind(__mako_require__, "src/pages/SubjectPage.tsx")))),
                        '7': /*#__PURE__*/ _react.default.lazy(()=>__mako_require__.ensure2("src/pages/EventPage.tsx").then(__mako_require__.dr(interop, __mako_require__.bind(__mako_require__, "src/pages/EventPage.tsx")))),
                        '8': /*#__PURE__*/ _react.default.lazy(()=>__mako_require__.ensure2("src/pages/FeaturePage.tsx").then(__mako_require__.dr(interop, __mako_require__.bind(__mako_require__, "src/pages/FeaturePage.tsx")))),
                        '9': /*#__PURE__*/ _react.default.lazy(()=>__mako_require__.ensure2("src/pages/RegulationPage.tsx").then(__mako_require__.dr(interop, __mako_require__.bind(__mako_require__, "src/pages/RegulationPage.tsx")))),
                        '10': /*#__PURE__*/ _react.default.lazy(()=>__mako_require__.ensure2("src/pages/KnowledgeQA/index.tsx").then(__mako_require__.dr(interop, __mako_require__.bind(__mako_require__, "src/pages/KnowledgeQA/index.tsx")))),
                        '11': /*#__PURE__*/ _react.default.lazy(()=>__mako_require__.ensure2("src/pages/CommunityDiscovery/index.tsx").then(__mako_require__.dr(interop, __mako_require__.bind(__mako_require__, "src/pages/CommunityDiscovery/index.tsx")))),
                        '12': /*#__PURE__*/ _react.default.lazy(()=>__mako_require__.ensure2("src/.umi/core/EmptyRoute.tsx").then(__mako_require__.dr(interop, __mako_require__.bind(__mako_require__, "src/.umi/core/EmptyRoute.tsx")))),
                        '13': /*#__PURE__*/ _react.default.lazy(()=>__mako_require__.ensure2("src/pages/404.tsx").then(__mako_require__.dr(interop, __mako_require__.bind(__mako_require__, "src/pages/404.tsx")))),
                        'ant-design-pro-layout': /*#__PURE__*/ _react.default.lazy(()=>__mako_require__.ensure2("src/.umi/plugin-layout/Layout.tsx").then(__mako_require__.dr(interop, __mako_require__.bind(__mako_require__, "src/.umi/plugin-layout/Layout.tsx")))),
                        'umi/plugin/openapi': /*#__PURE__*/ _react.default.lazy(()=>__mako_require__.ensure2("src/.umi/plugin-openapi/openapi.tsx").then(__mako_require__.dr(interop, __mako_require__.bind(__mako_require__, "src/.umi/plugin-openapi/openapi.tsx"))))
                    }
                };
            }
            if (prevRefreshReg) self.$RefreshReg$ = prevRefreshReg;
            if (prevRefreshSig) self.$RefreshSig$ = prevRefreshSig;
            function registerClassComponent(filename, moduleExports) {
                for(const key in moduleExports)try {
                    if (key === "__esModule") continue;
                    const exportValue = moduleExports[key];
                    if (_reactrefresh.isLikelyComponentType(exportValue) && exportValue.prototype && exportValue.prototype.isReactComponent) _reactrefresh.register(exportValue, filename + " " + key);
                } catch (e) {}
            }
            function $RefreshIsReactComponentLike$(moduleExports) {
                if (_reactrefresh.isLikelyComponentType(moduleExports || moduleExports.default)) return true;
                for(var key in moduleExports)try {
                    if (_reactrefresh.isLikelyComponentType(moduleExports[key])) return true;
                } catch (e) {}
                return false;
            }
            registerClassComponent(module.id, module.exports);
            if ($RefreshIsReactComponentLike$(module.exports)) {
                module.meta.hot.accept();
                _reactrefresh.performReactRefresh();
            }
        }
    }
}, function(runtime) {
    runtime._h = '6792714008760219582';
    runtime.updateEnsure2Map({
        "node_modules/@antv/g6/es/index.js": [
            "vendors_2",
            "common",
            "vendors_1",
            "p__CommunityDiscovery__index"
        ],
        "src/.umi/core/EmptyRoute.tsx": [
            "src/.umi/core/EmptyRoute.tsx"
        ],
        "src/.umi/plugin-layout/Layout.tsx": [
            "vendors_2",
            "src/.umi/plugin-layout/Layout.tsx"
        ],
        "src/.umi/plugin-openapi/openapi.tsx": [
            "vendors_2",
            "vendors_0",
            "src/.umi/plugin-openapi/openapi.tsx"
        ],
        "src/pages/404.tsx": [
            "p__404"
        ],
        "src/pages/CommunityDiscovery/index.tsx": [
            "vendors_2",
            "common",
            "vendors_1",
            "p__CommunityDiscovery__index"
        ],
        "src/pages/EventPage.tsx": [
            "vendors_2",
            "common",
            "vendors_1",
            "p__EventPage"
        ],
        "src/pages/FeaturePage.tsx": [
            "vendors_2",
            "common",
            "vendors_1",
            "p__FeaturePage"
        ],
        "src/pages/GeneralPage.tsx": [
            "vendors_2",
            "common",
            "vendors_1",
            "p__GeneralPage"
        ],
        "src/pages/KnowledgeBuild/index.tsx": [
            "common",
            "vendors_0",
            "p__KnowledgeBuild__index"
        ],
        "src/pages/KnowledgeQA/api/agent.ts": [
            "vendors_2",
            "vendors_0",
            "vendors_1",
            "p__KnowledgeQA__index"
        ],
        "src/pages/KnowledgeQA/index.tsx": [
            "vendors_2",
            "vendors_0",
            "vendors_1",
            "p__KnowledgeQA__index"
        ],
        "src/pages/RegulationPage.tsx": [
            "vendors_2",
            "common",
            "vendors_1",
            "p__RegulationPage"
        ],
        "src/pages/SubjectPage.tsx": [
            "vendors_2",
            "common",
            "vendors_1",
            "p__SubjectPage"
        ],
        "src/pages/Welcome.tsx": [
            "vendors_0",
            "vendors_1",
            "p__Welcome"
        ],
        "src/pages/user/login/index.tsx": [
            "p__user__login__index"
        ]
    });
    ;
});

//# sourceMappingURL=umi.9487420288147666731.hot-update.js.map