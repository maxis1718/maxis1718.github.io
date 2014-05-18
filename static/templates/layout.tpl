<!DOCTYPE HTML>
<html>
<head>
	<!-- coding : utf-8 -->
	<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
	<!-- cache : off
	<meta http-equiv="cache-control" content="no-cache">
	<meta http-equiv="pragma" content="no-cache">
	<meta http-equiv="expires" content="0">
	-->
	<!-- IE9 -->
	<meta http-equiv="X-UA-Compatible" content="IE=9" />

	<!-- description -->
<!-- 	<meta name="Keywords" content="{{ meta['keywords'] }}" />
	<meta name="Description" content="{{ meta['Description'] }}" />
	<meta name="Date" content="{{ meta['date'] }}" />
	<meta name="Author" content="{{ meta['Author'] }}" /> -->

	<!-- Page title -->
	<title>Maxis Kao</title>

	<!-- CSS -->
	<link rel="shortcut icon" href="img/favicon.png">

	<!-- CSS -->
    <link rel="stylesheet" href="css/util.css" type="text/css">
    <link rel="stylesheet" href="css/main.css" type="text/css">

	<!-- jQuery -->
	<script type="text/javascript" src="js/jquery.js"></script>
	<script type="text/javascript" src="js/lib.js"></script>
	<script type="text/javascript" src="js/main.js"></script>	
</head>

<body>
	<div id="container">

		<div id="header">
			<div id="logo">Maxis Kao</div>
			<div id="menu">
<!-- 				<div class="menu-item {{ selected['profile'] }} ">
					<span><a href="{{ url_for('show', section="profile") }}">About</a></span>
					<span class="tri {{ triangle['profile'] }}"></span>
				</div>
				<div class="menu-item {{ selected['projects'] }}">
					<span><a href="{{ url_for('show', section="projects") }}">Works</a></span>
					<span class="tri {{ triangle['projects'] }}"></span>
				</div>
				<div class="menu-item {{ selected['publications'] }}">
					<span><a href="{{ url_for('show', section="publications") }}">Publications</a></span>
					<span class="tri {{ triangle['publications'] }}"></span>
				</div>
				<div class="menu-item {{ selected['about'] }} hide">
					<span><a href="{{ url_for('show', section="about") }}">Traveling</a></span>
					<span class="tri {{ triangle['about'] }}"></span> -->
				</div>
			</div>
		</div>	<!-- end of #header -->
		<div id="content">
		<!-- {% block content %} -->
		<!-- {% endblock %} -->
		</div> <!-- end of #content -->

		<div id="footer">
			
<!-- 			<div class="footer-wrap" id="copyright-wrap">
				<span id="copyright">Copyright &copy; 2014 Maxis Kao</span>
			</div>
			<div id="socialnetwork" class="footer-wrap">
				<div class="socialnetwork-block">
					<a href="http://tw.linkedin.com/pub/maxis-kao/52/743/810/" target="_blank">
						<img src="{{ url_for('static', filename='logos/linkedin-128.png') }}" alt="linkedin"/>
					</a>
				</div>
				
				<div class="socialnetwork-block">
					<a href="http://maxiskao.tumblr.com" target="_blank">
						<img src="{{ url_for('static', filename='logos/tumblr-128.png') }}" alt="tumblr"/>
					</a>
				</div>
				
				<div class="socialnetwork-block">
					<a href="https://www.facebook.com/maxis.kao" target="_blank">
						<img src="{{ url_for('static', filename='logos/facebook-128.png') }}" alt="facebook"/>
					</a>
				</div>
				
				<div class="socialnetwork-block">
					<a href="https://plus.google.com/107848034286093524296" target="_blank">
						<img src="{{ url_for('static', filename='logos/google-128.png') }}" alt="google+"/>
					</a>
				</div>


				<div class="socialnetwork-block" style="padding-left:2px">
					<a href="https://github.com/maxis1718" target="_blank">
						<img src="{{ url_for('static', filename='logos/github-128.png') }}" alt="github"/>
					</a>
				</div> -->
			</div>			
		</div> <!-- end of #footer -->
	</div> <!-- end of #container -->
</body>
<script>
  (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
  (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
  m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
  })(window,document,'script','//www.google-analytics.com/analytics.js','ga');

  ga('create', 'UA-48175532-3', 'maxiskao.herokuapp.com');
  ga('send', 'pageview');

</script>
</html>
