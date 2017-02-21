var ReportApplicationLifecycle = (function () {
    function ReportApplicationLifecycle(reportSetup, tagFilter, title) {
        this.reportSetup = reportSetup;
        this.tagFilter = tagFilter;
        this.title = title;
    }

    ReportApplicationLifecycle.prototype.render = function () {
        var that = this;

        var tagGroupPromise = $.get(this.reportSetup.apiBaseUrl + '/tagGroups')
            .then(function (response) {
                var tagGroups = {};
                for (var i = 0; i < response.length; i++) {
                    tagGroups[response[i]['name']] = [];
                    for (var j = 0; j < response[i]['tags'].length; j++) {
                        tagGroups[response[i]['name']].push(response[i]['tags'][j]['name']);
                    }
                }
                return tagGroups;
            });

        var factSheetPromise = $.get(this.reportSetup.apiBaseUrl + '/factsheets?relations=true'
            + '&types[]=10&types[]=16&pageSize=-1'
            + '&filterRelations[]=serviceHasProjects&filterRelations[]=factSheetHasLifecycles'
            + '&filterAttributes[]=displayName'
            + '&filterAttributes[]=ID'
            + '&filterAttributes[]=fullName'
            + '&filterAttributes[]=resourceType'
            + '&filterAttributes[]=tags'
        )
            .then(function (response) {
                return response.data;
            });



        $.when(tagGroupPromise, factSheetPromise)
            .then(function (tagGroups, data) {
                var fsIndex = new FactSheetIndex(data);
                var list = fsIndex.getSortedList('services');

                var reportUtils = new ReportUtils();

                var getTagFromGroup = function (object, validTags) {
                    var cc = object.tags.filter(function (x) {
                        if (validTags.indexOf(x) >= 0)
                            return true;
                        else
                            return false;
                    });

                    if (cc.length)
                        return cc[0];

                    return '';
                };

                var getLookup = function (data) {
                    var ret = {};
                    for (var i = 0; i < data.length; i++) {
                        ret[data[i]] = data[i];
                    }

                    return ret;
                };

                var output = [];

                var projectTypes = tagGroups['Project Type'];
                var costCentres = tagGroups['CostCentre'];
                var deployments = tagGroups['Deployment'];
				var lifecycleArray = reportUtils.lifecycleArray();

                var projectImpacts = {
                    1: "Adds",
                    2: "Modifies",
                    3: "Sunsets"
                };
                var projectImpactOptions = [];
                for (var key in projectImpacts) {
                    projectImpactOptions.push(projectImpacts[key]);
                }
                var decommissioningRE = /decommissioning/i;
				
				var createItem = function (outputItem, lifecycle) {
					var newItem = {};
					for (var key in outputItem) {
						newItem[key] = outputItem[key];
					}
					newItem.lifecyclePhase = lifecycle.phase;
					newItem.lifecycleStart = lifecycle.startDate;
					return newItem;
				};

                for (var i = 0; i < list.length; i++) {
                    if (!that.tagFilter || list[i].tags.indexOf(that.tagFilter) != -1) {
                        var lifecycles = reportUtils.getLifecycles(list[i]);
                        var projects = [];
                        // Projects
                        for (var z = 0; z < list[i].serviceHasProjects.length; z++) {
                            var tmp = list[i].serviceHasProjects[z];
                            if (tmp) {
                                if (tmp.projectID && fsIndex.index.projects[tmp.projectID]) {
                                    var projectType = getTagFromGroup(fsIndex.index.projects[tmp.projectID], projectTypes);
                                    var projectName = fsIndex.index.projects[tmp.projectID].fullName;
                                    var outputItem = {
                                        name: list[i].fullName,
                                        id: list[i].ID,
                                        costCentre: getTagFromGroup(list[i], costCentres),
                                        deployment: getTagFromGroup(list[i], deployments),
                                        projectId: tmp.projectID,
                                        projectName: projectName,
                                        projectImpact: tmp.projectImpactID ? projectImpacts[tmp.projectImpactID] : '',
                                        projectType: projectType,
                                        lifecyclePhase: '',
                                        lifecycleStart: ''
                                    };
                                    for (var j = 0; j < lifecycles.length; j++) {
                                        var addItem = false;
                                        switch (lifecycles[j].phaseID) {
                                            case '1': // plan
                                            case '2': // phase in
                                                if (tmp.projectImpactID && tmp.projectImpactID === '1') {
                                                    addItem = true;
                                                }
                                                break;
                                            case '3': // active
                                                if (!decommissioningRE.test(projectName)
                                                        && (!tmp.projectImpactID || tmp.projectImpactID === '1' || tmp.projectImpactID === '2')) {
                                                    addItem = true;
                                                }
                                                break;
                                            case '4': // phase out
                                            case '5': // end of life
                                                if (decommissioningRE.test(projectName) && tmp.projectImpactID === '3') {
                                                    addItem = true;
                                                }
                                                break;
                                            default:
                                                throw new Error('Unknown phaseID: ' + lifecycles[j].phaseID);
                                        }
                                        if (addItem) {
                                            output.push(createItem(outputItem, lifecycles[j]));
                                        }
                                    }
                                }
                            }
                        }
                        if (list[i].serviceHasProjects.length === 0) {
                            var outputItem = {
                                name: list[i].fullName,
                                id: list[i].ID,
                                costCentre: getTagFromGroup(list[i], costCentres),
                                deployment: getTagFromGroup(list[i], deployments),
                                projectId: '',
                                projectName: '',
                                projectImpact: '',
                                projectType: '',
                                lifecyclePhase: '',
                                lifecycleStart: ''
                            };
                            for (var j = 0; j < lifecycles.length; j++) {
								output.push(createItem(outputItem, lifecycles[j]));
                            }
                        }
                    }
                }


                function link(cell, row) {
                    return '<a href="' + that.reportSetup.baseUrl + '/services/' + row.id + '" target="_blank">' + row.name + '</a>';
                }

                function linkProject(cell, row) {
                    if (row.projectId)
                        return '<a href="' + that.reportSetup.baseUrl + '/projects/' + row.projectId + '" target="_blank">' + row.projectName + '</a>';
                }

                ReactDOM.render(
                    <BootstrapTable
                            data={output}
                            striped={true}
                            hover={true}
                            search={true}
                            pagination={true}
                            exportCSV={true}>
                        <TableHeaderColumn
                            dataField="id"
                            isKey={true}
                            hidden={true}>ID</TableHeaderColumn>
                        <TableHeaderColumn
                            dataField="name"
							width="300"
                            dataAlign="left"
                            dataSort={true}
                            dataFormat={link}
                            filter={{ type: "TextFilter", placeholder: "Please enter a value" }}>Application Name</TableHeaderColumn>
                        <TableHeaderColumn
                            dataField="costCentre"
                            width="150"
                            dataAlign="left"
                            dataSort={true}
                            filter={{ type: "SelectFilter", options: getLookup(costCentres) }}>Cost Centre</TableHeaderColumn>
                        <TableHeaderColumn
                            dataField="deployment"
                            width="180"
                            dataAlign="left"
                            dataSort={true}
                            filter={{ type: "SelectFilter", options: getLookup(deployments) }}>Deployment</TableHeaderColumn>
                        <TableHeaderColumn
                            dataField="lifecyclePhase"
                            width="120"
                            dataAlign="left"
                            dataSort={true}
                            filter={{ type: "SelectFilter", options: getLookup(lifecycleArray) }}>Phase</TableHeaderColumn>
                        <TableHeaderColumn
                            dataField="lifecycleStart"
                            width="120"
                            dataAlign="left"
                            dataSort={true}
                            filter={{ type: "TextFilter", placeholder: "Please enter a value" }}>Phase Start</TableHeaderColumn>
                        <TableHeaderColumn
                            dataField="projectName"
							width="300"
                            dataAlign="left"
                            dataSort={true}
                            dataFormat={linkProject}
                            filter={{ type: "TextFilter", placeholder: "Please enter a value" }}>Project Name</TableHeaderColumn>
                        <TableHeaderColumn
                            dataField="projectImpact"
                            width="150"
                            dataAlign="left"
                            dataSort={true}
                            filter={{ type: "SelectFilter", options: getLookup(projectImpactOptions) }}>Project Impact</TableHeaderColumn>
                        <TableHeaderColumn
                            dataField="projectType"
                            width="150"
                            dataAlign="left"
                            dataSort={true}
                            filter={{ type: "SelectFilter", options: getLookup(projectTypes) }}>Project Type</TableHeaderColumn>
                    </BootstrapTable>,
                    document.getElementById("app")
                );
            });
    };

    return ReportApplicationLifecycle;
})();