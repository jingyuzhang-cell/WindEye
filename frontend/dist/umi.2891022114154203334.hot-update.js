globalThis.makoModuleHotUpdate('src/.umi/umi.ts?hmr', {
    modules: {
        "src/.umi/plugin-layout/icons.tsx": function(module, exports, __mako_require__) {
            "use strict";
            __mako_require__.d(exports, "__esModule", {
                value: true
            });
            __mako_require__.d(exports, "default", {
                enumerable: true,
                get: function() {
                    return _default;
                }
            });
            var _interop_require_default = __mako_require__("@swc/helpers/_/_interop_require_default");
            var _interop_require_wildcard = __mako_require__("@swc/helpers/_/_interop_require_wildcard");
            var _reactrefresh = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
            var _DashboardOutlined = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/@umijs/plugins/node_modules/@ant-design/icons/es/icons/DashboardOutlined.js"));
            var _MessageOutlined = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/@umijs/plugins/node_modules/@ant-design/icons/es/icons/MessageOutlined.js"));
            var _ToolOutlined = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/@umijs/plugins/node_modules/@ant-design/icons/es/icons/ToolOutlined.js"));
            var _ClusterOutlined = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/@umijs/plugins/node_modules/@ant-design/icons/es/icons/ClusterOutlined.js"));
            var _TeamOutlined = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/@umijs/plugins/node_modules/@ant-design/icons/es/icons/TeamOutlined.js"));
            var _ThunderboltOutlined = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/@umijs/plugins/node_modules/@ant-design/icons/es/icons/ThunderboltOutlined.js"));
            var _DotChartOutlined = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/@umijs/plugins/node_modules/@ant-design/icons/es/icons/DotChartOutlined.js"));
            var _SafetyCertificateOutlined = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/@umijs/plugins/node_modules/@ant-design/icons/es/icons/SafetyCertificateOutlined.js"));
            var _RadarChartOutlined = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/@umijs/plugins/node_modules/@ant-design/icons/es/icons/RadarChartOutlined.js"));
            var prevRefreshReg;
            var prevRefreshSig;
            prevRefreshReg = self.$RefreshReg$;
            prevRefreshSig = self.$RefreshSig$;
            self.$RefreshReg$ = (type, id)=>{
                _reactrefresh.register(type, module.id + id);
            };
            self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
            var _default = {
                DashboardOutlined: _DashboardOutlined.default,
                MessageOutlined: _MessageOutlined.default,
                ToolOutlined: _ToolOutlined.default,
                ClusterOutlined: _ClusterOutlined.default,
                TeamOutlined: _TeamOutlined.default,
                ThunderboltOutlined: _ThunderboltOutlined.default,
                DotChartOutlined: _DotChartOutlined.default,
                SafetyCertificateOutlined: _SafetyCertificateOutlined.default,
                RadarChartOutlined: _RadarChartOutlined.default
            };
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
    runtime._h = '9487420288147666731';
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

//# sourceMappingURL=umi.2891022114154203334.hot-update.js.map