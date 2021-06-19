/*#####################################################################################
  NAME: AWT - Archer Workflow Tracker
  AUTHOR: Luciano Veronese
  DATE: July 2020
  VERSION: 1.4
  DESCRIPTION: display a visual representation of the main phases of a workflow whose
  states are described by a values list. Supports the concept of substate to track
  the origin of a landing state. Fully customizable in solor, size, and other attributes
  Supports tooltips and tooltip actions  
  DEPENDENCIES: JSAlib
  #####################################################################################*/

// The Custom Object code is wrapped by the module design pattern to bound the namespace
// Only the DisplayAWT function is made availble outside the module (AWT.DisplayAWT()) 
var AWT = (function () {

    // State phase coding
    const STS_Past = 'P';
    const STS_Current = 'C';
    const STS_Future = 'F';

    // Helper function: add the Description text to the selected item and updates the Status
    function awtEnrichItem(item, SelectedItems) {
        item.Description = JSA.GetJSONfromHTML(item.Description);

        if (item.SortOrder == SelectedItems.SortOrder) {
            item.Status = STS_Current;
        } else {
            if (item.SortOrder < SelectedItems.SortOrder)
                item.Status = STS_Past;
            else {
                item.Status = STS_Future;
            }
        }
        return (item);
    }

    // This function generates the markup for different types of icons
    // The icon type is described by the property of the JSON object in the Description
    // fasicon: <name of Fontawesome icon>
    // mdsicon: <name of Google Material Design icon>
    // texticon: <Just a plain text>
    function awtGetIconMarkup(descr) {
        if ((typeof descr.fasicon != 'undefined') && (descr.fasicon != ''))
            return (`<i class="fas fa-${descr.fasicon}"></i>`);
        if ((typeof descr.faricon != 'undefined') && (descr.faricon != ''))
            return (`<i class="far fa-${descr.faricon}"></i>`);
        if ((typeof descr.fabicon != 'undefined') && (descr.fabicon != ''))
            return (`<i class="fab fa-${descr.fabicon}"></i>`);
        if ((typeof descr.mdicon != 'undefined') && (descr.mdicon != ''))
            return (`<i class="material-icons md-36">${descr.mdicon}</i>`);
        if ((typeof descr.texticon != 'undefined') && (descr.texticon != ''))
            return (`<i class="TextIcon">${descr.texticon}</i>`);
        return ('');
    }

    // This function generates the markup for the options configured in the Description of the values list items
    let awtGetOptionsMarkup = (item) => {
        // The Description field may include some options encoded as a JSON file
        // If an option is not available, a default value is set (different for states and substates)
        // The options are encoded as an object whose properties include the proper markup to render
        let opts = Object();
        if (item.ParentName == '') { // MAIN STATE
            if (item.Description == '' || item.Description == null) {
                // Default values for main state
                opts.icon = `<i class="fas fa-code-branch"></i>`;
                opts.tooltip = `<i class="qtip tip-top" data-tip="Workflow State">`;
                return (opts);
            }
            opts.icon = awtGetIconMarkup(item.Description);
        } else { // SUB-STATE
            if (item.Description == '' || item.Description == null) {
                // Default values for substate
                opts.icon = "";
                opts.tooltip = `<i class="qtip tip-top" data-tip="Workflow SubState">`;
                return (opts);
            }
            opts.icon = "";
        }
        // The tooltip is replaced with the action (if available) but only for the current state
        // Any HTML tag is removed as any error might break the generated HTML (it's an injection)
        if ((item.Status == STS_Current) && (item.Description.action != null)) {
            opts.tooltip = `<i class="qtipaction tip-top" data-tip="${item.Description.action.replace(/(<([^>]+)>)/ig, '')}">`;
        } else {
            opts.tooltip = item.Description.tooltip != '' ? `<i class="qtip tip-top" data-tip="${item.Description.tooltip.replace(/(<([^>]+)>)/ig, '')}">` : '<i>';
        }
        return (opts);
    }

    // Generate the markup for a workflow phase, A phase is a group of one State and one Connection
    // A State is made of a Node, a Label and Children, Children are made of Substates which include Labels
    // The function returns the generated markup as a string
    function awtRenderPhase(CurrentPhase, nodearray) {
        // Options are defined as JSON object in the VL item description. If they are defined, they are applied, otherwise they are not
        // If Description is empty, a default value is used
        let phaseopts = awtGetOptionsMarkup(CurrentPhase.State);
        // Initial markup for the phase
        let mk = `<div class="${!CurrentPhase.State.IsLast?'awtBeforeLast':''} awtPhase"><div class="awtState" Id="Step${CurrentPhase.State.Step}.${CurrentPhase.State.SubStep}" Status='${CurrentPhase.State.Status}'>`;
        // Add the markup to display the optional icon and a tooltip. Any html tag is stripped away from the tooltip text.
        // Tooltips are displayed if defined. If a TooltipAction is added, it is displayed for the active state and takes precendence over the tooltip text
        mk += `<div class="awtStateLabelContainer"><div class="awtTheme awtStateLabel">${CurrentPhase.State.Name}</div></div>${phaseopts.tooltip}<div class="awtTheme awtNode">${phaseopts.icon}</div></i>`;

        if (CurrentPhase.Children.length > 0) {
            // Setup the initial markup for the children
            mk += `<div class="awtStateChildren"><div class="awtHasChildrenBar"><div class="awtChildrenBar"></div></div>`;
            let imk = CurrentPhase.Children.map(
                Children => {
                    // Get the markup for the optional icon and tooltip
                    let childopts = awtGetOptionsMarkup(Children);
                    // Build the markup for the children
                    return (`<div class="awtSubstate" StepId="${Children.Step}.${Children.SubStep}" Status='${Children.Status}'>${childopts.tooltip}<div class="awtTheme awtSubstateLabel">${Children.Name}</div></i></div>`)
                }
            ).join('');
            mk += imk;
            mk += `</div>`;
        }
        mk += `</div>`;
        if (nodearray.length > 1) { // Generate the markup for the Connections only is there are more than 1 state
            if (!CurrentPhase.State.IsLast) { // Do not generate the markup for the last state
                mk += CurrentPhase.State.Status == STS_Past ? `<div class="awtTheme awtConnection" Id='Connection-${CurrentPhase.State.Step}' ><div class="awtConnectionBar" Id='ConnectionBar-${CurrentPhase.State.Step}' Status='${STS_Past}'></div></div>` : `<div class="awtTheme awtConnection" Id='Connection-${CurrentPhase.State.Step}'><div class="awtConnectionBar" Id='ConnectionBar-${CurrentPhase.State.Step}' Status='${STS_Future}'></div></div>`;
            }
        }
        mk += `</div>`;
        return (mk);
    }

    // Display the Phase (State and Connection) markup including the animation
    // If PastCheckmark (string) is null, the Past nodes do not change their icons
    // otherwise the variable text is the name of a Material Design icon
    function awtDisplayPhase(item, PastIcon) {

        // Show the State
        if (item.querySelector('.awtState') == null)
            return;
        item.querySelector('.awtState').style.visibility = 'visible';
        if (item.querySelector('.awtConnection') == null)
            return;
        let cb = item.querySelector('.awtConnection').querySelector('.awtConnectionBar');
        // Show the connection, applying the animation
        // The animation must be restarted for each connection, this is why the
        // class is removed and attached
        cb.style.visibility = 'hidden';
        cb.classList.remove('awtConnectionBarAnimation');
        cb.style.visibility = 'visible';
        cb.classList.add('awtConnectionBarAnimation');

        if (PastIcon != null) {
            // Replace the icon of the Past Nodes with a specific material design icon (a check by default)
            if (item.querySelector('.awtState').getAttribute('status') == STS_Past) {
                let tsel = item.querySelector('.awtState .qtip .awtNode');
                if ((tsel != null) && (typeof tsel.childNodes[0] != 'undefined'))
                    tsel.removeChild(tsel.childNodes[0]); // Remove the child (could be different types of icons)
                let DoneIconNode = document.createElement("i"); // Create the markup to display a specific material icon
                DoneIconNode.className = "material-icons md-36";
                DoneIconNode.innerHTML = PastIcon;
                tsel.appendChild(DoneIconNode);
            }
        }
    }

    // Render the markup included in the target element
    // Depending on the CSS property, the animation is displayed with the configured delay
    const awtMarkupRendering = (TargetawtElement, PastIcon) => {
        if (TargetawtElement == null)
            return;

        let aniStatus = window.getComputedStyle(TargetawtElement).getPropertyValue('--ConnectionAnimationEnable').trim();
        if (aniStatus == "yes") {
            TargetawtElement.style.visibility = 'hidden';
            let aniDelay = window.getComputedStyle(TargetawtElement).getPropertyValue('--ConnectionAnimationDelay').trim().slice(0, -2);
            let i = 0;
            for (let item of TargetawtElement.getElementsByClassName('awtPhase'))
                setTimeout(() => {
                    awtDisplayPhase(item, PastIcon)
                }, i++ * aniDelay);
        } else {
            TargetawtElement.style.visibility = 'visible';
        }
    }

    //----------------------------------------------
    // Main function to display the Workflow Tracker
    //----------------------------------------------
    function DisplayAWT(AWTStatusFieldAlias, AWTContainer) {

        let AWTStatusVLId;
        let awtcontainerEl = document.getElementById(AWTContainer);

        ContentRecordId = getRecordId();

        if (awtcontainerEl == null) {
            console.log(`[DisplayAWT] - container "${AWTContainer}" is not defined`);
            return;
        }
        if (ContentRecordId == 0) {
            console.warn("[DisplayAWT] - New content record detected. Do not attempt rendering the AWT...");
            awtcontainerEl.innerHTML = '<h1 style="background:#176DC2;color:white;text-align:center">The Worklow Tracker will be displayed after the content record is saved</h1>';
            return;
        }

        JSA.SpinLoader('#' + AWTContainer, 'arco-spinner', "ON");

        // Set the variable to manage the Past state icons
        let PastIcon = getComputedStyle(document.documentElement).getPropertyValue('--PastIcon').trim();
        PastIcon = PastIcon == "null" ? null : PastIcon;

        let MyArcherSession;
        try {
            console.log("[DisplayAWT] - Getting the Archer Session...");
            JSA.jsaGetSession()
                .then((resp) => {
                    MyArcherSession = {
                        ...resp
                    };

                    // The Archer session includes a map of the "FieldAlias - FieldId" information...
                    let FieldIdAliasMap = {
                        ...MyArcherSession.RecordFields
                    }.FieldIdByAlias;
                    // ...so we can convert the FieldAlias into a Field Id
                    AWTStatusVLId = FieldIdAliasMap.get(AWTStatusFieldAlias);
                    console.log(`[DisplayAWT] - Starting using Status Alias="${AWTStatusFieldAlias}" (Id=${AWTStatusVLId}) @RecordID=${ContentRecordId}`);

                    JSA.jsaGetValuesListValues(MyArcherSession, ContentRecordId, AWTStatusVLId)
                        .then((jresp) => {
                            //er;
                            if (jresp == null) {
                                console.warn("[DisplayAWT] - %cVALUES LIST EMPTY ", 'background: #C80000; color: #FFF');
                                return;
                            }
                            //==============================================================
                            // GET ALL THE VALUES OF THE VALUES LIST AND THE SELECTED ITEM
                            // NOTE: If multiple items are selected, only the first 
                            // is considered (for the purpose of the AWT...)
                            const AllItems = Array.from(jresp.AllItems.values())
                            const SelectedItems = jresp.SelectedItems[0];

                            //====================================================================================================================
                            // BUILD THE DATA STRUCTURE as an array of objects {State, Children} where the State is the top level VL item while
                            // the Children is an array of VL items that ar children of the top level item, that is the sub-states
                            // If a JSON object is included in the Description of the VL item, then this is pulled and added to the items
                            // A Status attribute is assigned to the States or Children based on the position of the SelectedItem
                            let wfnodes = [],
                                wfstep = -1,
                                SubStep,
                                NumberOfNodes,
                                lastnode,
                                CurrentStateParent;
                            //console.log("[DisplayAWT] -%c VALUES LIST DEFINITION ", 'background: #00A800; color: #FFF');
                            for (let item of AllItems) { // Loop through all the items of the VL
                                item = awtEnrichItem(item, SelectedItems); // Add description, update Status to the selected item
                                if (item.ParentName == "") { // This is a parent node
                                    item.IsFirst = item.SortOrder == 0 ? true : false; // Tag the first state in the flow
                                    SubStep = 1;
                                    wfstep += 1;
                                    item.Step = wfstep;
                                    lastnode = wfstep; // Track the possibly last step in the flow
                                    item.SubStep = 0;
                                    CurrentStateParent = item; // This is used to set to Active the parent of the item if the latter is a substate
                                    if (item.SortOrder == SelectedItems.SortOrder) {
                                        SelectedItems.Step = wfstep;
                                        SelectedItems.SubStep = 0;
                                        SelectedItems.Status = STS_Current;
                                    }
                                    wfnodes.push({
                                        State: item,
                                        Children: new Array()
                                    }); // Build the wf node (state)
                                    //console.log(`[S${item.Step}.${item.SubStep}:${item.Status}:#${item.SortOrder}] %c["${item.ParentName}" => "${item.Name}"]`, 'background: #FFF; color: #DC143C', `[${item.ParentId}=>${item.NameId}] - Description ["${item.Description}"] - NumericValue ["${item.NumericValue}"]`);
                                } else { // This is a children (sub state) 
                                    if (item.SortOrder == SelectedItems.SortOrder) { // Selected (Current) sub state
                                        SelectedItems.Step = wfstep;
                                        SelectedItems.SubStep = SubStep;
                                        SelectedItems.Status = STS_Current;
                                        CurrentStateParent.Status = STS_Current; // Set to active also the parent state of the selected item
                                    }
                                    item.Step = wfstep;
                                    item.SubStep = SubStep++;
                                    wfnodes[wfstep].Children.push(item); // Attach a children (sub-state)
                                    //console.log(`[S${item.Step}.${item.SubStep}:${item.Status}:#${item.SortOrder}] %c["${item.Name}"]`, 'background: #FFF; color: #DC143C', `[${item.NameId}] - Description ["${item.Description}"] - NumericValue ["${item.NumericValue}"]`);
                                }
                            }
                            if (lastnode == (wfnodes.length - 1))
                                wfnodes[lastnode].State.IsLast = true;

                            console.log(`%c[DisplayAWT] - SELECTED VALUES LIST ITEMS `, 'color: #009900', `[S${SelectedItems.Step}.${SelectedItems.SubStep}:${SelectedItems.Status}:#${SelectedItems.SortOrder}]-["${SelectedItems.ParentName}"] => ["${SelectedItems.Name}"]`);
                            NumberOfNodes = wfnodes.length;
                            /*
                            // Show the elements of the data structure (just for tracking)
                            wfnodes.map((Node, nidx) => {
                                console.log(`%c Node[${nidx}] `, 'background: #DC143C; color: #FFF');
                                console.log(Node.State);
                                if (Node.Children.length > 0) {
                                    Node.Children.forEach(children => {
                                        console.log(children);
                                    })
                                } 
                            });
                            */
                            //=======================================================================================
                            //                  BUILD THE MARKUP to display the AWT states
                            //=======================================================================================
                            let markup;

                            if (awtcontainerEl !== null) {
                                // The markup must be build upfront in a variable as this must be a valid HTML code 
                                // in order to be assigned to innerHTML whihc automatically closes divs if necessary
                                markup = `<div class = "awtContainer">`;
                                awtcontainerEl.innerHTML = markup;
                                markup += `${ wfnodes.map((CurrentNode, idx, nodearray) => {return (awtRenderPhase(CurrentNode, nodearray)); }).join('') }`;
                                markup += `</div>`;
 
                                JSA.SpinLoader('#'+AWTContainer, 'arco-spinner', "OFF");

                                // Render in the DOM the generated markup, but not display it yet
                                awtcontainerEl.style.visibility = 'hidden';
                                awtcontainerEl.innerHTML = markup;


                                // Render the markup, with the optional animation
                                awtMarkupRendering(awtcontainerEl, PastIcon);
                                //let xmlcontainer = document.getElementById('xmlcontainer');
                                //xmlcontainer.innerText = formatXml(markup);
                            }
                        })
                        .catch((err) => {
                            console.error('[DisplayAWT] - CATCHED ERROR IN PROMISE: ', err)
                            throw new Error('Higher-level error. ' + err.message);
                        }); // End of promise
                });
        } catch (e) {
            console.error('[DisplayAWT] - ERROR: ', e)
        }
    }

    return { // Publicly available methods
        DisplayAWT
    }
})()